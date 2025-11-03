// public/js/profanity-filter.js

// Lista expandida de palavras e termos inadequados em português e inglês.
const forbiddenWords = [
    // --- Português (Palavrões e Termos Ofensivos) ---
    'arrombado', 'arrombada', 'anal', 'anus', 'baba-ovo', 'babaca', 'baitola',
    'bicha', 'boceta', 'boquete', 'bosta', 'buceta', 'cabaço', 'cacete',
    'caga', 'cagado', 'cagao', 'canalha', 'caralho', 'cassete', 'corno',
    'cornudo', 'cretino', 'crlh', 'cuzao', 'cuzuda', 'cu', 'desgraça',
    'desgraca', 'enculada', 'enfia', 'escroto', 'escrota', 'estupido',
    'estupida', 'estupro', 'fecal', 'fedor', 'fedido', 'fezes', 'foda',
    'foder', 'fode', 'fodendo', 'fudecao', 'fudido', 'furnica', 'furona', 'grelinho',
    'grelo', 'goza', 'gozar', 'idiota', 'imbecil', 'kct', 'lavaco', 'merda',
    'mijo', 'mija', 'otario', 'otaria', 'paspalho', 'peido', 'pemba', 'penteio',
    'perereca', 'pica', 'pila', 'pinto', 'piranha', 'piroca', 'piru', 'porra',
    'prega', 'prostibulo', 'prostituta', 'prostituto', 'punheta', 'punheteiro', 'puta',
    'puto', 'pqp', 'pariu', 'quenga', 'rabo', 'rabuda', 'rabudo', 'retardado',
    'retardada', 'rola', 'rolinha', 'siririca', 'tarado', 'tarada', 'tezao',
    'tesao', 'tetuda', 'transar', 'trepar', 'trouxa', 'vagina', 'veado',
    'viado', 'vsf', 'xavasca', 'xereca', 'xochota', 'xota', 'chupa', 'chupar', 'sexo',
     "soca fofo","bucet@", "pepeka" , "vagabunda",

    // --- Português (Combinações e Criatividade do Usuário) ---
    'te komo', 'tecomo', 'tekumo', 'masturbando', 'masturba', 'tomas turbando',
    'pingando', 'gozando', 'gozada',

    // --- Inglês (Palavrões e Termos Ofensivos) ---
    'anal', 'anus', 'arse', 'ass', 'assfucker', 'asshole', 'bastard', 'bitch',
    'blowjob', 'bollock', 'bollok', 'boner', 'boob', 'bugger', 'bum', 'butt',
    'clitoris', 'cock', 'coon', 'crap', 'cunt', 'damn', 'dick', 'dildo', 'dyke',
    'fag', 'faggot', 'fanny', 'felching', 'fellate', 'fellatio', 'flange',
    'fuck', 'f u c k', 'fudgepacker', 'goddamn', 'hell', 'homo', 'jerk',
    'jizz', 'knobend', 'labia', 'lmao', 'lmfao', 'muff', 'nigger', 'nigga',
    'omg', 'penis', 'piss', 'poop', 'prick', 'pube', 'pussy', 'queer', 'scrotum',
    'sex', 'shit', 's hit', 'sh1t', 'slut', 'smegma', 'spunk', 'tit', 'tosser',
    'turd','vagina', 'wank', 'whore', 'wtf'
];

/**
 * Verifica se um texto contém palavras ou variações de palavras proibidas.
 * @param {string} text - O texto a ser verificado.
 * @returns {boolean} - Retorna `true` se encontrar uma palavra proibida, `false` caso contrário.
 */
export function containsForbiddenWords(text) {
    if (!text) return false;

    // Normaliza o texto de entrada para facilitar a verificação
    const normalizedText = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't');

    // Verifica se alguma palavra da lista proibida corresponde a uma palavra inteira no texto
    return forbiddenWords.some(word => {
        // Cria uma expressão regular para encontrar a palavra proibida como uma palavra inteira.
        // O `\b` é uma "fronteira de palavra", garantindo que não estamos a apanhar sub-palavras.
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        return regex.test(normalizedText);
    });
}