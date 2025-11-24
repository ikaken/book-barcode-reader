// DOM要素の取得
const barcodeInput = document.getElementById('barcodeInput');
const readBtn = document.getElementById('readBtn');
const clearBtn = document.getElementById('clearBtn');
const resultDiv = document.getElementById('result');
const errorDiv = document.getElementById('error');

// 結果表示用の要素
const isbnDisplay = document.getElementById('isbnDisplay');
const titleDisplay = document.getElementById('titleDisplay');
const cCodeDisplay = document.getElementById('cCodeDisplay');
const targetDisplay = document.getElementById('targetDisplay');
const formatDisplay = document.getElementById('formatDisplay');
const contentDisplay = document.getElementById('contentDisplay');

// ISBNから書籍情報を取得する関数
async function getBookInfoByISBN(isbn) {
    try {
        // Google Books APIを使用して書籍情報を取得
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
        
        if (!response.ok) {
            throw new Error('書籍情報の取得に失敗しました');
        }
        
        const data = await response.json();
        
        if (data.totalItems === 0) {
            return null; // 書籍が見つからない
        }
        
        const book = data.items[0].volumeInfo;
        return {
            title: book.title || '不明',
            authors: book.authors ? book.authors.join(', ') : '不明',
            publisher: book.publisher || '不明',
            publishedDate: book.publishedDate || '不明'
        };
        
    } catch (error) {
        console.error('APIエラー:', error);
        return null;
    }
}

// 書籍JANコードからISBNを抽出する関数
function extractISBNFromJAN(janData) {
    const cleaned = janData.trim();
    
    // パターン1: 13桁のISBN（978または979で始まる）
    if (/^(978|979)\d{10}$/.test(cleaned)) {
        return cleaned;
    }
    
    // パターン2: ハイフン区切りのISBN
    const isbnMatch = cleaned.match(/(978|979)[-\s\d]{10,17}/);
    if (isbnMatch) {
        return isbnMatch[0].replace(/[-\s]/g, '');
    }
    
    // パターン3: 長いデータの中からISBNを抽出
    const potentialISBN = cleaned.match(/(978|979)\d{10}/);
    if (potentialISBN) {
        return potentialISBN[0];
    }
    
    return null;
}

// 書籍JANコードからCコードを抽出する関数
function extractCCodeFromJAN(janData) {
    // 空白や改行を削除
    const cleaned = janData.trim();
    
    // パターン1: JANコードとCコードがハイフン区切り（例: 9784101001012-0091）
    const hyphenMatch = cleaned.match(/^(\d{13})[-\s](\d{4})$/);
    if (hyphenMatch) {
        return hyphenMatch[2];
    }
    
    // パターン2: JANコードにCプレフィックス付きCコード（例: 9784101001012C0091）
    const cPrefixMatch = cleaned.match(/^(\d{13})C*(\d{4})$/);
    if (cPrefixMatch) {
        return cPrefixMatch[2];
    }
    
    // パターン3: JANコードのみでCコードが特定位置にある場合
    // 日本の書籍（978-4-）の場合、特定の位置からCコードを抽出
    if (/^9784\d{9}$/.test(cleaned)) {
        // 例として8-11桁目をCコードと仮定（実際の位置は要確認）
        const potentialCCode = cleaned.substring(7, 11);
        if (/^\d{4}$/.test(potentialCCode)) {
            return potentialCCode;
        }
    }
    
    // パターン4: 純粋なCコード（4桁）
    if (/^\d{4}$/.test(cleaned)) {
        return cleaned;
    }
    
    // パターン5: Cプレフィックス付きの純粋なCコード
    const pureCMatch = cleaned.match(/^C*(\d{4})$/);
    if (pureCMatch) {
        return pureCMatch[1];
    }
    
    // パターン6: チェックデジット付きCコード（5桁）
    if (/^\d{5}$/.test(cleaned)) {
        return cleaned.substring(0, 4);
    }
    
    // パターン7: 長いデータの中から最後の4桁をCコードと仮定
    const allFourDigits = cleaned.match(/(\d{4})/g);
    if (allFourDigits && allFourDigits.length > 0) {
        return allFourDigits[allFourDigits.length - 1];
    }
    
    return null;
}

// 結果を表示する関数（更新版）
async function displayResult(ccode, originalData) {
    try {
        // ISBNを抽出
        const isbn = extractISBNFromJAN(originalData);
        
        // Cコードを解析
        const parsed = parseCCode(ccode);
        
        if (!parsed) {
            throw new Error('Cコードの解析に失敗しました');
        }
        
        // 書籍情報を取得
        let bookInfo = null;
        if (isbn) {
            bookInfo = await getBookInfoByISBN(isbn);
        }
        
        // 結果を表示
        isbnDisplay.textContent = isbn || '不明';
        titleDisplay.textContent = bookInfo ? bookInfo.title : '取得できませんでした';
        cCodeDisplay.textContent = ccode;
        targetDisplay.textContent = parsed.target;
        formatDisplay.textContent = parsed.format;
        contentDisplay.textContent = parsed.content;
        
        // デバッグ情報
        console.log('元のJANコードデータ:', originalData);
        console.log('抽出したISBN:', isbn);
        console.log('抽出したCコード:', ccode);
        console.log('書籍情報:', bookInfo);
        console.log('Cコード解析結果:', parsed);
        
        // 結果エリアを表示
        resultDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
        
    } catch (error) {
        displayError(error.message);
    }
}

// エラーを表示する関数
function displayError(message) {
    errorDiv.textContent = `❌ エラー: ${message}`;
    errorDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
}

// JANコードを処理する関数（更新版）
async function processJANCode(janData) {
    try {
        if (!janData.trim()) {
            displayError('JANコードを入力してください');
            return;
        }
        
        // JANコードからCコードを抽出
        const ccode = extractCCodeFromJAN(janData);
        
        if (!ccode) {
            throw new Error('JANコードからCコードを抽出できませんでした');
        }
        
        // 結果を表示（async関数なのでawait）
        await displayResult(ccode, janData);
        
    } catch (error) {
        displayError(error.message);
    }
}

// 読み込みボタンのイベントリスナー
readBtn.addEventListener('click', async () => {
    await processJANCode(barcodeInput.value);
});

// Enterキーでも処理
barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        clearTimeout(inputTimeout);
        await processJANCode(e.target.value);
    }
});

// 入力イベントリスナー（バーコードリーダーからの入力を想定）
let inputTimeout;
barcodeInput.addEventListener('input', async (e) => {
    // 入力が完了してから少し待つ（バーコードリーダーは高速入力）
    clearTimeout(inputTimeout);
    inputTimeout = setTimeout(async () => {
        const value = e.target.value;
        if (value.length >= 13) {
            await processJANCode(value);
        } else if (value.length >= 4) {
            // 短い場合はCコードとして直接処理
            await processJANCode(value);
        }
    }, 300);
});

// クリアボタン
clearBtn.addEventListener('click', () => {
    barcodeInput.value = '';
    resultDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    barcodeInput.focus();
});

// ページ読み込み時に入力欄にフォーカス
window.addEventListener('load', () => {
    barcodeInput.focus();
});

// 例: テスト用のサンプルJANコード
// JANコードのみ: 9784101001012
// JAN+Cコード: 9784101001012-0091
// JAN+Cコード: 9784101001012C0091
// Cコードのみ: 0091, C0091
// 実際のバーコードリーダーで読み取った値を使用してください
