import fs from 'fs';
import path from 'path';

const TOOL_FOLDERS = {
    brief:    'Бриф AI',
    profile:  'Профиль AI',
    diagnost: 'Диагност AI',
    smyslovik:'Смысловик',
    logic:    'Логик AI',
    practice: 'Практик AI',
};

function loadInstruction(toolId) {
    const folder = TOOL_FOLDERS[toolId];
    if (!folder) return null;
    try {
        const dir = path.join(process.cwd(), 'Instructions', folder);
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir)
            .filter(f => /\.(txt|md)$/i.test(f))
            .sort();
        if (files.length === 0) return null;
        return files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n\n');
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { toolId, userText, fileContent = '' } = req.body;

    const rawInstruction = toolId ? loadInstruction(toolId) : null;

    if (!rawInstruction) {
        return res.status(400).json({ error: `Инструкция для инструмента "${toolId}" не найдена` });
    }

    // OpenAI requires the word "json" in the prompt when using json_object response format
    const systemPrompt = rawInstruction.toLowerCase().includes('json')
        ? rawInstruction
        : rawInstruction + '\n\nОтвечай строго в формате JSON (JSON object).';

    if (!userText) {
        return res.status(400).json({ error: 'userText is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText + (fileContent ? '\n\nСодержимое файла:\n' + fileContent : '') }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
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
        return res.status(500).json({ error: 'Invalid JSON from OpenAI' });
    }
}
