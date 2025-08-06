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
  const limit = parseInt(searchParams.get('limit')) || 10;
  const random = searchParams.get('random') === 'true';

  let query = 'SELECT * FROM flashcards WHERE 1=1';
  const params = [];

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }

  if (difficulty) {
    query += ' AND difficulty = ?';
    params.push(parseInt(difficulty));
  }

  if (random) {
    query += ' ORDER BY RANDOM()';
  } else {
    query += ' ORDER BY created_at DESC';
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
            perspective: 1000px;
            margin-bottom: 2rem;
        }

        .flashcard {
            width: 400px;
            height: 250px;
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
            height: 100%;
            backface-visibility: hidden;
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            font-size: 1.5rem;
            font-weight: 600;
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

        .add-card-form {
            background: rgba(255, 255, 255, 0.95);
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 500px;
            margin-top: 2rem;
        }

        .add-card-form h3 {
            margin-bottom: 1.5rem;
            color: #333;
            text-align: center;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #555;
        }

        .form-group input, .form-group select, .form-group textarea {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
        }

        .form-group textarea {
            resize: vertical;
            min-height: 80px;
        }

        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
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
                width: 320px;
                height: 200px;
            }

            .flashcard-face {
                font-size: 1.2rem;
                padding: 1.5rem;
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
                max-width: 320px;
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
                <label>&nbsp;</label>
                <button onclick="loadFlashcards()">載入字卡</button>
            </div>
        </div>

        <div class="stats" id="stats" style="display: none;">
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
            <div class="flashcard" id="flashcard" onclick="flipCard()">
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

        <div class="loading" id="loading" style="display: none;">載入中...</div>
        <div class="error" id="error" style="display: none;"></div>

        <div class="add-card-form">
            <h3>📝 新增字卡</h3>
            <form id="addCardForm">
                <div class="form-group">
                    <label for="frontText">正面內容</label>
                    <textarea id="frontText" placeholder="輸入問題或要記憶的內容" required></textarea>
                </div>
                <div class="form-group">
                    <label for="backText">背面內容</label>
                    <textarea id="backText" placeholder="輸入答案或解釋" required></textarea>
                </div>
                <div class="form-group">
                    <label for="categoryInput">分類</label>
                    <select id="categoryInput">
                        <option value="general">general</option>
                        <option value="custom">+ 新增分類</option>
                    </select>
                    <input type="text" id="customCategoryInput" placeholder="輸入新分類名稱" style="display: none; margin-top: 0.5rem;">
                </div>
                <div class="form-group">
                    <label for="difficultyInput">難度</label>
                    <select id="difficultyInput">
                        <option value="1">簡單</option>
                        <option value="2">中等</option>
                        <option value="3">困難</option>
                    </select>
                </div>
                <button type="submit">新增字卡</button>
            </form>
        </div>
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
            document.getElementById('addCardForm').addEventListener('submit', function(e) {
                e.preventDefault();
                addNewCard();
            });
            
            // 處理分類選擇變化
            document.getElementById('categoryInput').addEventListener('change', function(e) {
                const customInput = document.getElementById('customCategoryInput');
                if (e.target.value === 'custom') {
                    customInput.style.display = 'block';
                    customInput.required = true;
                } else {
                    customInput.style.display = 'none';
                    customInput.required = false;
                    customInput.value = '';
                }
            });
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
                
                // 更新新增字卡用的分類選單
                const addSelect = document.getElementById('categoryInput');
                addSelect.innerHTML = '<option value="general">general</option>';
                
                categories.forEach(cat => {
                    if (cat.category !== 'general') {
                        const option = document.createElement('option');
                        option.value = cat.category;
                        option.textContent = cat.category;
                        addSelect.appendChild(option);
                    }
                });
                
                // 添加"新增分類"選項
                const customOption = document.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = '+ 新增分類';
                addSelect.appendChild(customOption);
            } catch (error) {
                console.error('載入分類失敗:', error);
            }
        }

        // 載入字卡
        async function loadFlashcards() {
            const category = document.getElementById('categorySelect').value;
            const difficulty = document.getElementById('difficultySelect').value;
            
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
                
                const response = await fetch(\`/api/flashcards?\${params}\`);
                flashcards = await response.json();
                
                if (flashcards.length === 0) {
                    showError('沒有找到符合條件的字卡');
                    return;
                }
                
                currentIndex = 0;
                stats.correct = 0;
                stats.incorrect = 0;
                
                showCard();
                updateStats();
                
                document.getElementById('flashcardContainer').style.display = 'block';
                document.getElementById('actions').style.display = 'flex';
                document.getElementById('stats').style.display = 'grid';
                
            } catch (error) {
                showError('載入字卡失敗: ' + error.message);
            } finally {
                showLoading(false);
            }
        }

        // 顯示當前字卡
        function showCard() {
            if (flashcards.length === 0) return;
            
            const card = flashcards[currentIndex];
            document.getElementById('cardFront').textContent = card.front;
            document.getElementById('cardBack').textContent = card.back;
            
            // 重置翻轉狀態
            isFlipped = false;
            document.getElementById('flashcard').classList.remove('flipped');
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

        // 新增字卡
        async function addNewCard() {
            const front = document.getElementById('frontText').value.trim();
            const back = document.getElementById('backText').value.trim();
            const categorySelect = document.getElementById('categoryInput').value;
            const customCategory = document.getElementById('customCategoryInput').value.trim();
            const difficulty = parseInt(document.getElementById('difficultyInput').value);
            
            // 決定使用的分類
            let category;
            if (categorySelect === 'custom') {
                if (!customCategory) {
                    showError('請輸入新分類名稱');
                    return;
                }
                category = customCategory;
            } else {
                category = categorySelect || 'general';
            }
            
            if (!front || !back) {
                showError('請填寫正面和背面內容');
                return;
            }
            
            showLoading(true);
            hideError();
            
            try {
                const response = await fetch('/api/flashcards', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        front,
                        back,
                        category,
                        difficulty
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    // 清空表單
                    document.getElementById('addCardForm').reset();
                    document.getElementById('categoryInput').value = 'general';
                    document.getElementById('customCategoryInput').style.display = 'none';
                    document.getElementById('customCategoryInput').required = false;
                    document.getElementById('customCategoryInput').value = '';
                    
                    // 重新載入分類
                    await loadCategories();
                    
                    alert('字卡新增成功！');
                } else {
                    showError(result.message || '新增字卡失敗');
                }
                
            } catch (error) {
                showError('新增字卡失敗: ' + error.message);
            } finally {
                showLoading(false);
            }
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