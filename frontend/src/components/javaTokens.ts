// A small Java tokenizer for display-only syntax highlighting
// (docs/ARCHITECTURE.md §5.2). Concatenating the tokens reproduces the line.

export type TokenKind = 'keyword' | 'type' | 'number' | 'comment' | 'string' | 'plain'

export interface Token {
  kind: TokenKind
  text: string
}

const KEYWORDS = new Set([
  'public', 'private', 'protected', 'class', 'static', 'final', 'void', 'int', 'boolean', 'new', 'null',
  'this', 'return', 'if', 'else', 'for', 'while', 'true', 'false',
])

const PATTERN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|\b(\d+)\b|\b([A-Za-z_]\w*)\b/g

export function tokenizeJava(line: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  const push = (kind: TokenKind, text: string) => {
    if (!text) return
    const prev = tokens[tokens.length - 1]
    if (kind === 'plain' && prev?.kind === 'plain') prev.text += text
    else tokens.push({ kind, text })
  }
  for (const m of line.matchAll(PATTERN)) {
    push('plain', line.slice(last, m.index))
    const [text, comment, str, num, word] = m
    if (comment) push('comment', comment)
    else if (str) push('string', str)
    else if (num) push('number', num)
    else if (KEYWORDS.has(word)) push('keyword', word)
    else if (/^[A-Z]/.test(word)) push('type', word)
    else push('plain', text)
    last = m.index + text.length
  }
  push('plain', line.slice(last))
  return tokens
}
