// Cloudflare Worker 主要處理程序
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 設定
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 處理 OPTIONS 請求
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 路由處理
      if (path === '/' || path === '/index.html') {
        return new Response(getIndexHTML(), {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      if (path === '/api/flashcards' && method === 'GET') {
        return await getFlashcards(env, url.searchParams);
      }

      if (path === '/api/flashcards' && method === 'POST') {
        return await createFlashcard(request, env);
      }

      if (path.startsWith('/api/flashcards/') && method === 'PUT') {
        const id = path.split('/')[3];
        return await updateProgress(request, env, id);
      }

      if (path === '/api/categories' && method === 'GET') {
        return await getCategories(env);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// 獲取數據庫實例（本地開發使用 DB_LOCAL，生產環境使用 DB）
function getDB(env) {
  const db = env.DB_LOCAL || env.DB;
  console.log('Available bindings:', Object.keys(env));
  console.log('Using database:', db ? 'found' : 'not found');
  if (!db) {
    throw new Error('No database binding available. Available bindings: ' + Object.keys(env).join(', '));
  }
  return db;
}

// 獲取字卡列表
async function getFlashcards(env, searchParams) {
  const category = searchParams.get('category');
  const difficulty = searchParams.get('difficulty');
  const practiceMode = searchParams.get('practiceMode');
  const limit = parseInt(searchParams.get('limit')) || 10;
  const random = searchParams.get('random') === 'true';
  const userId = searchParams.get('userId') || 'anonymous';

  let query, params = [];

  if (practiceMode === 'incorrect') {
    // 錯題練習模式：只顯示答錯的字卡
    query = `SELECT f.* FROM flashcards f 
             INNER JOIN user_progress up ON f.id = up.flashcard_id 
             WHERE up.user_id = ? AND up.last_result = -1`;
    params.push(userId);
  } else {
    // 一般模式：顯示所有字卡
    query = 'SELECT * FROM flashcards WHERE 1=1';
  }

  if (category && category !== 'all') {
    if (practiceMode === 'incorrect') {
      query += ' AND f.category = ?';
    } else {
      query += ' AND category = ?';
    }
    params.push(category);
  }

  if (difficulty) {
    if (practiceMode === 'incorrect') {
      query += ' AND f.difficulty = ?';
    } else {
      query += ' AND difficulty = ?';
    }
    params.push(parseInt(difficulty));
  }

  if (random) {
    query += ' ORDER BY RANDOM()';
  } else {
    query += practiceMode === 'incorrect' ? ' ORDER BY f.created_at DESC' : ' ORDER BY created_at DESC';
  }

  query += ' LIMIT ?';
  params.push(limit);

  const db = getDB(env);
  const result = await db.prepare(query).bind(...params).all();
  
  return new Response(JSON.stringify(result.results), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 創建新字卡
async function createFlashcard(request, env) {
  const data = await request.json();
  const { front, back, category = 'general', difficulty = 1 } = data;

  if (!front || !back) {
    return new Response('Front and back are required', { status: 400 });
  }

  const db = getDB(env);
  const result = await db.prepare(
    'INSERT INTO flashcards (front, back, category, difficulty) VALUES (?, ?, ?, ?)'
  ).bind(front, back, category, difficulty).run();

  return new Response(JSON.stringify({ 
    id: result.meta.last_row_id,
    message: 'Flashcard created successfully' 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 更新學習進度
async function updateProgress(request, env, flashcardId) {
  const data = await request.json();
  const { correct, userId = 'anonymous' } = data;

  const db = getDB(env);
  
  // 更新字卡的複習次數
  await db.prepare(
    'UPDATE flashcards SET review_count = review_count + 1, last_reviewed = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(flashcardId).run();

  // 插入或更新用戶進度
  const existingProgress = await db.prepare(
    'SELECT * FROM user_progress WHERE flashcard_id = ? AND user_id = ?'
  ).bind(flashcardId, userId).first();

  if (existingProgress) {
    const correctCount = correct ? existingProgress.correct_count + 1 : existingProgress.correct_count;
    const incorrectCount = !correct ? existingProgress.incorrect_count + 1 : existingProgress.incorrect_count;
    
    await db.prepare(
      'UPDATE user_progress SET correct_count = ?, incorrect_count = ?, last_result = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(correctCount, incorrectCount, correct ? 1 : -1, existingProgress.id).run();
  } else {
    await db.prepare(
      'INSERT INTO user_progress (flashcard_id, user_id, correct_count, incorrect_count, last_result) VALUES (?, ?, ?, ?, ?)'
    ).bind(flashcardId, userId, correct ? 1 : 0, correct ? 0 : 1, correct ? 1 : -1).run();
  }

  return new Response(JSON.stringify({ message: 'Progress updated' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// 獲取分類列表
async function getCategories(env) {
  const db = getDB(env);
  const result = await db.prepare(
    'SELECT DISTINCT category, COUNT(*) as count FROM flashcards GROUP BY category ORDER BY category'
  ).all();
  
  return new Response(JSON.stringify(result.results), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// HTML 頁面
function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>閃電字卡 - Lightning Flashcard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Huninn&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Huninn', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: #333;
        }

        .header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 1rem 2rem;
            text-align: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .header h1 {
            color: white;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .header p {
            color: rgba(255, 255, 255, 0.9);
            font-size: 1.1rem;
        }

        .container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
            width: 100%;
        }

        .controls {
            background: rgba(255, 255, 255, 0.95);
            padding: 1.5rem;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: 500px;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .control-group label {
            font-weight: 600;
            color: #555;
            font-size: 0.9rem;
        }

        select, button {
            padding: 0.75rem 1rem;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 1rem;
            transition: all 0.3s ease;
        }

        select:focus, button:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            cursor: pointer;
            font-weight: 600;
            min-width: 120px;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .flashcard-container {
            perspective: 1200px;
            margin-bottom: 2rem;
            min-height: 312px;
            display: flex;
            justify-content: center;
        }

        .flashcard {
            min-width: 400px;
            max-width: 1200px;
            width: auto;
            min-height: 312px;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.6s;
            cursor: pointer;
        }

        .flashcard.flipped {
            transform: rotateY(180deg);
        }

        .flashcard-face {
            position: absolute;
            width: 100%;
            min-height: 312px;
            backface-visibility: hidden;
            border-radius: 19px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 1rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            font-size: 1.2rem;
            font-weight: 600;
            white-space: pre-line;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
            overflow: hidden;
        }

        .flashcard-face > div {
            max-width: 100%;
            max-height: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        .flashcard-front {
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
            color: #333;
        }

        .flashcard-back {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #333;
            transform: rotateY(180deg);
        }

        .actions {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .btn-correct {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .btn-incorrect {
            background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
        }

        .btn-next {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #333;
        }

        .browse-actions {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .btn-prev {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .btn-flip {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }

        .stats {
            background: rgba(255, 255, 255, 0.95);
            padding: 1.5rem;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
            width: 100%;
            max-width: 600px;
        }

        .stat-item {
            text-align: center;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }

        .stat-label {
            color: #666;
            font-size: 0.9rem;
            margin-top: 0.25rem;
        }

        #practiceModeName {
            font-size: 1.5rem;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            transition: all 0.3s ease;
        }

        #practiceModeName.incorrect-mode {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            animation: pulse 2s infinite;
        }

        #practiceModeName.browse-mode {
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            color: #333;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }



        .loading {
            text-align: center;
            color: white;
            font-size: 1.2rem;
            margin: 2rem 0;
        }

        .error {
            background: #ff6b6b;
            color: white;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
            text-align: center;
        }

        @media (max-width: 768px) {
            .header h1 {
                font-size: 2rem;
            }

            .flashcard {
                min-width: 300px;
                max-width: 400px;
                width: auto;
                min-height: 250px;
            }

            .flashcard-face {
                font-size: 1rem;
                padding: 0.8rem;
                min-height: 250px;
                line-height: 1.2;
            }

            .controls {
                flex-direction: column;
                align-items: stretch;
            }

            .control-group {
                width: 100%;
            }

            .actions {
                flex-direction: column;
                width: 100%;
                max-width: 400px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ 閃電字卡</h1>
        <p>Lightning Flashcard</p>
    </div>

    <div class="container">
        <div class="controls">
            <div class="control-group">
                <label for="categorySelect">分類</label>
                <select id="categorySelect">
                    <option value="all">所有分類</option>
                </select>
            </div>
            <div class="control-group">
                <label for="difficultySelect">難度</label>
                <select id="difficultySelect">
                    <option value="">所有難度</option>
                    <option value="1">簡單</option>
                    <option value="2">中等</option>
                    <option value="3">困難</option>
                </select>
            </div>
            <div class="control-group">
                <label for="practiceMode">練習模式</label>
                <select id="practiceMode">
                    <option value="all">所有字卡</option>
                    <option value="incorrect">錯題練習</option>
                    <option value="browse">瀏覽字卡</option>
                </select>
            </div>
            <div class="control-group">
                <label>&nbsp;</label>
                <button onclick="loadFlashcards()">載入字卡</button>
            </div>
        </div>

        <div class="stats" id="stats" style="display: none;">
            <div class="stat-item">
                <div class="stat-value" id="practiceModeName">一般練習</div>
                <div class="stat-label">練習模式</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="totalCards">0</div>
                <div class="stat-label">總字卡數</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="currentIndex">0</div>
                <div class="stat-label">當前進度</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="correctCount">0</div>
                <div class="stat-label">答對次數</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="incorrectCount">0</div>
                <div class="stat-label">答錯次數</div>
            </div>
        </div>

        <div class="flashcard-container" id="flashcardContainer" style="display: none;">
            <div class="flashcard" id="flashcard" onclick="handleCardClick()">
                <div class="flashcard-face flashcard-front" id="cardFront">
                    點擊載入字卡開始學習
                </div>
                <div class="flashcard-face flashcard-back" id="cardBack">
                    答案會顯示在這裡
                </div>
            </div>
        </div>

        <div class="actions" id="actions" style="display: none;">
            <button class="btn-correct" onclick="markAnswer(true)">✓ 答對了</button>
            <button class="btn-incorrect" onclick="markAnswer(false)">✗ 答錯了</button>
            <button class="btn-next" onclick="nextCard()">下一張 →</button>
        </div>

        <div class="browse-actions" id="browseActions" style="display: none;">
            <button class="btn-prev" onclick="prevCard()">← 上一張</button>
            <button class="btn-flip" onclick="flipCard()">翻轉字卡</button>
            <button class="btn-next" onclick="nextCard()">下一張 →</button>
        </div>

        <div class="loading" id="loading" style="display: none;">載入中...</div>
        <div class="error" id="error" style="display: none;"></div>


    </div>

    <script>
        let flashcards = [];
        let currentIndex = 0;
        let isFlipped = false;
        let stats = {
            correct: 0,
            incorrect: 0
        };

        // 初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadCategories();
            setupEventListeners();
        });

        function setupEventListeners() {
            // 移除新增字卡表單相關的事件監聽器
        }

        // 載入分類
        async function loadCategories() {
            try {
                const response = await fetch('/api/categories');
                const categories = await response.json();
                const select = document.getElementById('categorySelect');
                
                // 清空現有選項（保留"所有分類"）
                select.innerHTML = '<option value="all">所有分類</option>';
                
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.category;
                    option.textContent = \`\${cat.category} (\${cat.count})\`;
                    select.appendChild(option);
                });
                

            } catch (error) {
                console.error('載入分類失敗:', error);
            }
        }

        // 載入字卡
        async function loadFlashcards() {
            const category = document.getElementById('categorySelect').value;
            const difficulty = document.getElementById('difficultySelect').value;
            const practiceMode = document.getElementById('practiceMode').value;
            
            showLoading(true);
            hideError();
            
            try {
                const params = new URLSearchParams({
                    limit: '50',
                    random: 'true'
                });
                
                if (category !== 'all') {
                    params.append('category', category);
                }
                
                if (difficulty) {
                    params.append('difficulty', difficulty);
                }
                
                if (practiceMode) {
                    params.append('practiceMode', practiceMode);
                }
                
                const response = await fetch(\`/api/flashcards?\${params}\`);
                flashcards = await response.json();
                
                if (flashcards.length === 0) {
                    const message = practiceMode === 'incorrect' ? '沒有找到錯題，恭喜你！' : '沒有找到符合條件的字卡';
                    showError(message);
                    return;
                }
                
                currentIndex = 0;
                stats.correct = 0;
                stats.incorrect = 0;
                
                // 更新練習模式指示器
                let practiceModeName;
                if (practiceMode === 'incorrect') {
                    practiceModeName = '錯題練習';
                } else if (practiceMode === 'browse') {
                    practiceModeName = '瀏覽字卡';
                } else {
                    practiceModeName = '一般練習';
                }
                
                const practiceModeElement = document.getElementById('practiceModeName');
                practiceModeElement.textContent = practiceModeName;
                
                // 添加或移除CSS類名
                practiceModeElement.classList.remove('incorrect-mode', 'browse-mode');
                if (practiceMode === 'incorrect') {
                    practiceModeElement.classList.add('incorrect-mode');
                } else if (practiceMode === 'browse') {
                    practiceModeElement.classList.add('browse-mode');
                }
                
                showCard();
                updateStats();
                
                document.getElementById('flashcardContainer').style.display = 'block';
                document.getElementById('stats').style.display = 'grid';
                
                // 根據練習模式顯示不同的操作按鈕
                if (practiceMode === 'browse') {
                    document.getElementById('actions').style.display = 'none';
                    document.getElementById('browseActions').style.display = 'flex';
                } else {
                    document.getElementById('actions').style.display = 'flex';
                    document.getElementById('browseActions').style.display = 'none';
                }
                
            } catch (error) {
                showError('載入字卡失敗: ' + error.message);
            } finally {
                showLoading(false);
            }
        }

        // 調整字卡高度
        function adjustCardHeight() {
            const flashcard = document.getElementById('flashcard');
            const container = document.querySelector('.flashcard-container');
            const frontFace = document.getElementById('cardFront');
            const backFace = document.getElementById('cardBack');
            
            // 暫時顯示當前面以測量高度
            const currentFace = isFlipped ? backFace : frontFace;
            const otherFace = isFlipped ? frontFace : backFace;
            
            // 測量內容高度
            currentFace.style.position = 'relative';
            currentFace.style.visibility = 'visible';
            otherFace.style.position = 'absolute';
            otherFace.style.visibility = 'hidden';
            
            const contentHeight = Math.max(currentFace.scrollHeight, 312);
            
            // 設置容器和字卡高度
            container.style.height = contentHeight + 'px';
            flashcard.style.height = contentHeight + 'px';
            
            // 恢復樣式
            currentFace.style.position = 'absolute';
            currentFace.style.visibility = 'visible';
            otherFace.style.position = 'absolute';
            otherFace.style.visibility = 'visible';
        }

        // 顯示當前字卡
        function showCard() {
            if (flashcards.length === 0) return;
            
            const card = flashcards[currentIndex];
            document.getElementById('cardFront').innerHTML = card.front;
            document.getElementById('cardBack').innerHTML = card.back;
            
            // 重置翻轉狀態
            isFlipped = false;
            document.getElementById('flashcard').classList.remove('flipped');
            
            // 調整容器高度以適應內容
            setTimeout(() => {
                adjustCardHeight();
            }, 50);
        }

        // 處理字卡點擊事件
        function handleCardClick() {
            const practiceMode = document.getElementById('practiceMode').value;
            
            // 在瀏覽模式下，點擊字卡不會翻轉，需要使用翻轉按鈕
            if (practiceMode !== 'browse') {
                flipCard();
            }
        }

        // 翻轉字卡
        function flipCard() {
            const flashcard = document.getElementById('flashcard');
            isFlipped = !isFlipped;
            
            if (isFlipped) {
                flashcard.classList.add('flipped');
            } else {
                flashcard.classList.remove('flipped');
            }
            
            // 翻轉後調整高度
            setTimeout(() => {
                adjustCardHeight();
            }, 300); // 等待翻轉動畫完成
        }

        // 標記答案
        async function markAnswer(correct) {
            if (flashcards.length === 0) return;
            
            const card = flashcards[currentIndex];
            
            try {
                await fetch(\`/api/flashcards/\${card.id}\`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ correct })
                });
                
                if (correct) {
                    stats.correct++;
                } else {
                    stats.incorrect++;
                }
                
                updateStats();
                
                // 標記答案後自動跳到下一張卡片
                nextCard();
                
            } catch (error) {
                console.error('更新進度失敗:', error);
            }
        }

        // 下一張字卡
        function prevCard() {
            if (flashcards.length === 0) return;
            
            // 如果當前卡片已翻轉，先翻回正面
            if (isFlipped) {
                flipCard(); // 翻回正面
                
                // 等待翻轉動畫完成後再切換到上一張
                setTimeout(() => {
                    currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length;
                    showCard();
                    updateStats();
                }, 600); // 600ms 對應 CSS 中的翻轉動畫時間
            } else {
                // 如果沒有翻轉，直接切換到上一張
                currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length;
                showCard();
                updateStats();
            }
        }

        function nextCard() {
            if (flashcards.length === 0) return;
            
            // 如果當前卡片已翻轉，先翻回正面
            if (isFlipped) {
                flipCard(); // 翻回正面
                
                // 等待翻轉動畫完成後再切換到下一張
                setTimeout(() => {
                    currentIndex = (currentIndex + 1) % flashcards.length;
                    showCard();
                    updateStats();
                }, 600); // 600ms 對應 CSS 中的翻轉動畫時間
            } else {
                // 如果沒有翻轉，直接切換到下一張
                currentIndex = (currentIndex + 1) % flashcards.length;
                showCard();
                updateStats();
            }
        }

        // 更新統計
        function updateStats() {
            document.getElementById('totalCards').textContent = flashcards.length;
            document.getElementById('currentIndex').textContent = currentIndex + 1;
            document.getElementById('correctCount').textContent = stats.correct;
            document.getElementById('incorrectCount').textContent = stats.incorrect;
        }



        // 顯示載入狀態
        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }

        // 顯示錯誤
        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        // 隱藏錯誤
        function hideError() {
            document.getElementById('error').style.display = 'none';
        }

        // 鍵盤快捷鍵
        document.addEventListener('keydown', function(e) {
            if (flashcards.length === 0) return;
            
            switch(e.key) {
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    flipCard();
                    break;
                case 'ArrowRight':
                case 'n':
                    e.preventDefault();
                    nextCard();
                    break;
                case '1':
                    e.preventDefault();
                    markAnswer(true);
                    break;
                case '2':
                    e.preventDefault();
                    markAnswer(false);
                    break;
            }
        });
    </script>
</body>
</html>`;
}