-- 創建字卡表
CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    difficulty INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    review_count INTEGER DEFAULT 0,
    last_reviewed DATETIME
);

-- 創建用戶學習進度表
CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flashcard_id INTEGER,
    user_id TEXT DEFAULT 'anonymous',
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    last_result INTEGER DEFAULT 0, -- 0: 未答, 1: 正確, -1: 錯誤
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flashcard_id) REFERENCES flashcards(id)
);

-- 插入一些示例數據
INSERT INTO flashcards (front, back, category, difficulty) VALUES
('Hello', '你好', 'English', 1),
('Thank you', '謝謝', 'English', 1),
('Good morning', '早安', 'English', 1),
('Apple', '蘋果', 'Vocabulary', 1),
('Computer', '電腦', 'Technology', 2),
('Beautiful', '美麗的', 'Adjective', 2),
('Programming', '程式設計', 'Technology', 3),
('Algorithm', '演算法', 'Technology', 3);