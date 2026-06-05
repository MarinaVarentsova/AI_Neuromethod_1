import fs from 'fs';
import path from 'path';

const TOOL_FOLDERS = {
    brief:     'Бриф AI',
    profile:   'Профиль AI',
    diagnost:  'Диагност AI',
    smyslovik: 'Смысловик',
    logic:     'Логик AI',
    practice:  'Практик AI',
};

function loadInstruction(toolId) {
    const folder = TOOL_FOLDERS[toolId];
    if (!folder) return null;
    try {
        const dir = path.join(process.cwd(), 'Instructions', folder);
        if (!fs.existsSync(dir)) return null;

        const allFiles = fs.readdirSync(dir)
            .filter(f => /\.(txt|md)$/i.test(f) && !f.startsWith('.'));

        // Main instruction first (starts with "Главная"), then KB files sorted
        const mainFiles = allFiles.filter(f => f.toLowerCase().startsWith('главная'));
        const kbFiles   = allFiles.filter(f => !f.toLowerCase().startsWith('главная')).sort();
        const ordered   = [...mainFiles, ...kbFiles];

        if (ordered.length === 0) return null;

        return ordered
            .map(f => `\n\n--- ${f} ---\n\n` + fs.readFileSync(path.join(dir, f), 'utf8'))
            .join('');
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { toolId, userText, fileContent = '' } = req.body;

    if (!toolId) {
        return res.status(400).json({ error: 'toolId is required' });
    }
    if (!userText) {
        return res.status(400).json({ error: 'userText is required' });
    }

    const systemPrompt = loadInstruction(toolId);
    if (!systemPrompt) {
        return res.status(400).json({ error: `Инструкция для инструмента "${toolId}" не найдена` });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const userContent = fileContent
        ? userText + '\n\nСодержимое файла:\n' + fileContent
        : userText;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userContent }
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: err.error?.message || 'OpenAI error' });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        return res.status(200).json(JSON.parse(content));
    } catch {
        return res.status(500).json({ error: 'Invalid JSON from OpenAI', raw: content.substring(0, 500) });
    }
}
