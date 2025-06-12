// Monaco Editor Configuration and Initialization
let monacoEditor = null;
let editorInitialized = false;

/**
 * Initialize Monaco Editor with fallback strategy.
 * Uses dynamic loading to avoid blocking the main thread and provides
 * a textarea fallback for environments where Monaco fails to load.
 */
function initMonacoEditor() {
    console.log('Starting Monaco Editor initialization...');
    
    const editorContainer = document.getElementById('editor');
    
    try {
        // Configure Monaco Environment before loading to prevent worker issues
        window.MonacoEnvironment = {
            getWorkerUrl: function(workerId, label) {
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                    self.MonacoEnvironment = {
                        baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/'
                    };
                    importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/base/worker/workerMain.js');`
                )}`;
            }
        };

        // Dynamic loading prevents blocking and allows graceful fallback
        const monacoScript = document.createElement('script');
        monacoScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
        monacoScript.onload = function() {
            console.log('Monaco loader script loaded');
            
            require.config({ 
                paths: { 
                    'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' 
                }
            });
            
            require(['vs/editor/editor.main'], function () {
                console.log('Monaco editor main loaded');
                createMonacoEditor();
            }, function(error) {
                console.error('Failed to load Monaco Editor main:', error);
                createFallbackEditor();
            });
        };
        
        monacoScript.onerror = function() {
            console.error('Failed to load Monaco loader script');
            createFallbackEditor();
        };
        
        document.head.appendChild(monacoScript);
        
        // Timeout ensures UI doesn't hang indefinitely on slow connections
        setTimeout(function() {
            if (!editorInitialized) {
                console.log('Monaco Editor timeout, using fallback');
                createFallbackEditor();
            }
        }, 5000);
    } catch (error) {
        console.error('Monaco Editor initialization failed:', error);
        createFallbackEditor();
    }
}

function createMonacoEditor() {
    const editorContainer = document.getElementById('editor');
    const defaultCode = `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`;

    try {
        editorContainer.innerHTML = '';

        monacoEditor = monaco.editor.create(editorContainer, {
            value: defaultCode,
            language: 'c',
            theme: 'vs-dark',
            fontSize: 14,
            fontFamily: "'Courier New', 'Monaco', 'Menlo', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            suggest: {
                showKeywords: true,
                showSnippets: true,
                showFunctions: true
            },
            quickSuggestions: {
                other: true,
                comments: true,
                strings: true
            },
            wordBasedSuggestions: true,
            parameterHints: { enabled: true },
            formatOnType: true,
            formatOnPaste: true,
            autoIndent: 'full',
            tabSize: 4,
            insertSpaces: true
        });

        // Custom C completions to improve developer experience
        monaco.languages.registerCompletionItemProvider('c', {
            provideCompletionItems: function(model, position) {
                const suggestions = [
                    {
                        label: 'printf',
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'printf("${1:Hello, World!\\n}");',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Print formatted output to stdout'
                    },
                    {
                        label: 'scanf',
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'scanf("${1:%d}", &${2:variable});',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Read formatted input from stdin'
                    },
                    {
                        label: 'for loop',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:10}; ${1:i}++) {\n\t${3:// code}\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'For loop template'
                    },
                    {
                        label: 'while loop',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'while (${1:condition}) {\n\t${2:// code}\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'While loop template'
                    }
                ];
                return { suggestions: suggestions };
            }
        });

        editorInitialized = true;
        console.log('Monaco Editor created successfully');

        // Global references required for integration with app.js
        window.monacoEditor = monacoEditor;
        window.getEditorValue = function() {
            return monacoEditor.getValue();
        };

        console.log('Global Monaco references set');
        
    } catch (error) {
        console.error('Error creating Monaco Editor:', error);
        createFallbackEditor();
    }
}

/**
 * Creates a textarea-based fallback editor with line numbers.
 * Provides basic editing functionality when Monaco fails to load.
 */
function createFallbackEditor() {
    if (editorInitialized) return;
    
    const editorContainer = document.getElementById('editor');
    const defaultCode = `#include <stdio.h>

int main() {

    //your code goes here

    return 0;
}`;
    
    editorContainer.innerHTML = `
        <div class="fallback-editor-container">
            <div id="lineNumbers"></div>
            <textarea id="fallbackEditor">${defaultCode}</textarea>
        </div>
    `;
    
    const textarea = document.getElementById('fallbackEditor');
    updateLineNumbers();
    
    textarea.addEventListener('input', updateLineNumbers);
    textarea.addEventListener('scroll', function() {
        document.getElementById('lineNumbers').scrollTop = textarea.scrollTop;
    });
    
    // Tab key support for proper indentation
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 4;
            updateLineNumbers();
        }
    });
    
    function updateLineNumbers() {
        const lineNumbers = document.getElementById('lineNumbers');
        const lines = textarea.value.split('\n').length;
        let numbersHtml = '';
        for (let i = 1; i <= lines; i++) {
            numbersHtml += i + '\n';
        }
        lineNumbers.textContent = numbersHtml;
    }
    
    editorInitialized = true;
    console.log('Fallback editor created');
}

/**
 * Gets the current editor content, handling both Monaco and fallback editors.
 */
function getEditorValue() {
    if (monacoEditor) {
        return monacoEditor.getValue();
    } else {
        const textarea = document.getElementById('fallbackEditor');
        return textarea ? textarea.value : '';
    }
}

/**
 * Inserts text at the current cursor position in either editor type.
 */
function insertText(text) {
    if (monacoEditor) {
        const selection = monacoEditor.getSelection();
        const id = { major: 1, minor: 1 };
        const op = {
            identifier: id,
            range: selection,
            text: text,
            forceMoveMarkers: true
        };
        monacoEditor.executeEdits("my-source", [op]);
        monacoEditor.focus();
    } else {
        const textarea = document.getElementById('fallbackEditor');
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
            textarea.focus();
            const updateLineNumbers = window.updateLineNumbers;
            if (updateLineNumbers) updateLineNumbers();
        }
    }
}

/**
 * Clears the editor content and resets output display.
 */
function clearCode() {
    if (monacoEditor) {
        monacoEditor.setValue('');
    } else {
        const textarea = document.getElementById('fallbackEditor');
        if (textarea) {
            textarea.value = '';
            const updateLineNumbers = window.updateLineNumbers;
            if (updateLineNumbers) updateLineNumbers();
        }
    }
    document.getElementById('output').textContent = 'Code cleared. Write some C code and run it!';
    document.getElementById('output').className = 'output';
}