const express = require('express');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

// Прямая ссылка на файл в Google Drive
const GOOGLE_DRIVE_URL = 'https://drive.google.com/uc?export=download&id=1UEnpQBZi3DcAiPJqr6qQ2HRC-QgjcK8X';
const DATA_FILE = '/tmp/cache_base.json';

// Функция для скачивания файла
async function downloadCacheFile() {
    return new Promise((resolve, reject) => {
        console.log('📥 Скачиваю базу данных с Google Drive...');
        
        const file = fs.createWriteStream(DATA_FILE);
        https.get(GOOGLE_DRIVE_URL, (response) => {
            if (response.statusCode === 302 || response.headers.location) {
                https.get(response.headers.location, (res2) => {
                    res2.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        console.log('✅ База данных загружена');
                        resolve();
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('✅ База данных загружена');
                    resolve();
                });
            }
        }).on('error', reject);
    });
}

let cacheData = {};

async function loadCache() {
    try {
        await downloadCacheFile();
        const rawData = fs.readFileSync(DATA_FILE, 'utf8');
        cacheData = JSON.parse(rawData);
        console.log(`📊 База загружена: ${Object.keys(cacheData).length} записей`);
    } catch (err) {
        console.error('❌ Ошибка загрузки базы:', err);
    }
}

app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

// Эндпоинт для получения всех данных (с пагинацией)
app.get('/sync/pull-all', (req, res) => {
    const entries = Object.entries(cacheData);
    const limit = parseInt(req.query.limit) || 10000;
    const offset = parseInt(req.query.offset) || 0;
    
    const paginated = Object.fromEntries(entries.slice(offset, offset + limit));
    
    res.json({
        entries: paginated,
        total: entries.length,
        offset: offset,
        hasMore: offset + limit < entries.length
    });
});

// 🆕 Эндпоинт для одной карты
app.get('/api/card/:cardId/:type', (req, res) => {
    const { cardId, type } = req.params;
    const key = `${type}_${cardId}`;
    res.json({ data: cacheData[key] || null });
});

// 🆕 Эндпоинт для batch-запросов (несколько карт за раз)
app.post('/api/batch', (req, res) => {
    const { keys } = req.body;
    if (!Array.isArray(keys)) {
        return res.status(400).json({ error: 'keys must be an array' });
    }
    
    const results = {};
    for (const key of keys) {
        results[key] = cacheData[key] || null;
    }
    res.json(results);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', entries: Object.keys(cacheData).length });
});

// Запуск сервера
loadCache().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📊 Всего записей: ${Object.keys(cacheData).length}`);
    });
});
