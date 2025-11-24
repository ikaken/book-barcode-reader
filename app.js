import { parseCCode } from './ccode-data.js';

/**
 * バーコード文字列の解析を行うクラス
 */
class BarcodeParser {
    /**
     * 全角数字を半角に変換し、前後の空白を削除する
     * @param {string} input 
     * @returns {string}
     */
    static normalizeInput(input) {
        if (!input) return '';
        return input
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .trim();
    }

    /**
     * 入力文字列からISBNを抽出する
     * @param {string} input 
     * @returns {string|null} 13桁のISBN（ハイフンなし）
     */
    static extractISBN(input) {
        const cleaned = this.normalizeInput(input);

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

    /**
     * 入力文字列からCコードを抽出する
     * @param {string} input 
     * @returns {string|null} 4桁のCコード
     */
    static extractCCode(input) {
        const cleaned = this.normalizeInput(input);

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

        // パターン3: 純粋なCコード（4桁）
        if (/^\d{4}$/.test(cleaned)) {
            return cleaned;
        }

        // パターン4: Cプレフィックス付きの純粋なCコード
        const pureCMatch = cleaned.match(/^C*(\d{4})$/);
        if (pureCMatch) {
            return pureCMatch[1];
        }

        // パターン5: チェックデジット付きCコード（5桁）
        if (/^\d{5}$/.test(cleaned)) {
            return cleaned.substring(0, 4);
        }

        // パターン6: 書籍JANコード第2段（192で始まる）
        // 例: 1920093005804 -> 0093 (Cコード)
        const secondJanMatch = cleaned.match(/^192(\d{4})/);
        if (secondJanMatch) {
            return secondJanMatch[1];
        }

        return null;
    }
}

/**
 * 書籍情報の取得を行うクラス
 */
class BookService {
    /**
     * ISBNから書籍情報を取得する
     * @param {string} isbn 
     * @returns {Promise<Object|null>}
     */
    static async fetchByISBN(isbn) {
        try {
            const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);

            if (!response.ok) {
                throw new Error('書籍情報の取得に失敗しました');
            }

            const data = await response.json();

            if (data.totalItems === 0) {
                return null;
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
}

/**
 * 個別の書籍読み取りウィジェットを制御するクラス
 */
class BookReaderWidget {
    constructor(rootId, nextWidgetId = null) {
        this.root = document.getElementById(rootId);
        this.nextWidgetId = nextWidgetId;

        if (!this.root) {
            console.error(`Element with id ${rootId} not found`);
            return;
        }

        // DOM要素の取得（ルート要素内から検索）
        this.elements = {
            // 2つの入力フィールドを取得
            isbnInput: this.root.querySelector('.isbn-input'),
            ccodeInput: this.root.querySelector('.ccode-input'),
            readBtn: this.root.querySelector('.read-btn'),
            clearBtn: this.root.querySelector('.clear-btn'),
            resultDiv: this.root.querySelector('.result'),
            errorDiv: this.root.querySelector('.error'),
            isbnDisplay: this.root.querySelector('.isbn-display'),
            titleDisplay: this.root.querySelector('.title-display'),
            cCodeDisplay: this.root.querySelector('.ccode-display'),
            targetDisplay: this.root.querySelector('.target-display'),
            formatDisplay: this.root.querySelector('.format-display'),
            contentDisplay: this.root.querySelector('.content-display')
        };

        this.inputTimeout = null;
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // 読み込みボタン
        this.elements.readBtn.addEventListener('click', () => {
            this.processInput();
        });

        // クリアボタン
        this.elements.clearBtn.addEventListener('click', () => {
            this.clear();
        });

        // ISBN入力欄のEnterキー
        if (this.elements.isbnInput) {
            this.elements.isbnInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Cコード入力欄へフォーカス移動
                    if (this.elements.ccodeInput) {
                        this.elements.ccodeInput.focus();
                        this.elements.ccodeInput.select();
                    }
                }
            });

            // 自動入力検知（ISBN）
            this.elements.isbnInput.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value.includes('\n') || value.includes('\r')) {
                    // 改行が含まれていればフォーカス移動
                    if (this.elements.ccodeInput) {
                        this.elements.ccodeInput.focus();
                        this.elements.ccodeInput.select();
                    }
                }
            });
        }

        // Cコード入力欄のEnterキー
        if (this.elements.ccodeInput) {
            this.elements.ccodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.processInput();
                }
            });

            // 自動入力検知（Cコード）
            this.elements.ccodeInput.addEventListener('input', (e) => {
                clearTimeout(this.inputTimeout);
                this.inputTimeout = setTimeout(() => {
                    const value = e.target.value;
                    if (value.includes('\n') || value.includes('\r') || value.length >= 4) {
                        this.processInput();
                    }
                }, 300);
            });
        }
    }

    async processInput() {
        const isbnValue = this.elements.isbnInput ? this.elements.isbnInput.value : '';
        const ccodeValue = this.elements.ccodeInput ? this.elements.ccodeInput.value : '';

        // 全角→半角変換
        const normalizedIsbn = BarcodeParser.normalizeInput(isbnValue);
        const normalizedCcode = BarcodeParser.normalizeInput(ccodeValue);

        if (!normalizedIsbn && !normalizedCcode) {
            // 両方空の場合は何もしない
            return;
        }

        try {
            // ISBNの抽出 (ISBN欄から優先、なければCコード欄からも探す)
            let isbn = BarcodeParser.extractISBN(normalizedIsbn);
            if (!isbn) {
                isbn = BarcodeParser.extractISBN(normalizedCcode);
            }

            // Cコードの抽出 (Cコード欄から優先、なければISBN欄からも探す)
            let ccode = BarcodeParser.extractCCode(normalizedCcode);
            if (!ccode) {
                ccode = BarcodeParser.extractCCode(normalizedIsbn);
            }

            if (!ccode) {
                throw new Error('Cコードを検出できませんでした。');
            }

            // Cコード解析
            const parsedCCode = parseCCode(ccode);
            if (!parsedCCode) {
                throw new Error('Cコードの解析に失敗しました');
            }

            // 書籍情報の取得
            let bookInfo = null;
            if (isbn) {
                bookInfo = await BookService.fetchByISBN(isbn);
            }

            // 結果表示
            this.showResult({
                isbn,
                ccode,
                parsedCCode,
                bookInfo
            });

            // 成功時、次のウィジェットのISBN欄へフォーカス移動
            if (this.nextWidgetId) {
                const nextWidget = document.getElementById(this.nextWidgetId);
                const nextInput = nextWidget?.querySelector('.isbn-input');
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }

        } catch (error) {
            this.showError(error.message);
            // エラー時は現在の入力欄（おそらくCコード欄）を選択状態に
            if (this.elements.ccodeInput) {
                this.elements.ccodeInput.select();
            }
        }
    }

    showResult(data) {
        const { isbn, ccode, parsedCCode, bookInfo } = data;

        this.elements.isbnDisplay.textContent = isbn || '不明';
        this.elements.titleDisplay.textContent = bookInfo ? bookInfo.title : (isbn ? '取得できませんでした' : '-');
        this.elements.cCodeDisplay.textContent = ccode;
        this.elements.targetDisplay.textContent = parsedCCode.target;
        this.elements.formatDisplay.textContent = parsedCCode.format;
        this.elements.contentDisplay.textContent = parsedCCode.content;

        this.elements.resultDiv.classList.remove('hidden');
        this.elements.errorDiv.classList.add('hidden');
    }

    showError(message) {
        this.elements.errorDiv.textContent = `❌ エラー: ${message}`;
        this.elements.errorDiv.classList.remove('hidden');
        this.elements.resultDiv.classList.add('hidden');
    }

    clear() {
        if (this.elements.isbnInput) this.elements.isbnInput.value = '';
        if (this.elements.ccodeInput) this.elements.ccodeInput.value = '';
        this.elements.resultDiv.classList.add('hidden');
        this.elements.errorDiv.classList.add('hidden');
        if (this.elements.isbnInput) this.elements.isbnInput.focus();
    }
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    // 書籍1のウィジェットを初期化
    const book1 = new BookReaderWidget('book1');
    book1.init();
});
