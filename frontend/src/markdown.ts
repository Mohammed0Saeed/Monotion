import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import katex from 'katex'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import haskell from 'highlight.js/lib/languages/haskell'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import julia from 'highlight.js/lib/languages/julia'
import kotlin from 'highlight.js/lib/languages/kotlin'
import latex from 'highlight.js/lib/languages/latex'
import markdown from 'highlight.js/lib/languages/markdown'
import matlab from 'highlight.js/lib/languages/matlab'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import 'katex/dist/katex.min.css'

// the languages a lecture is likely to show; their usual aliases (py, js, ts, sh, html, c++ …) work too
const LANGUAGES = { bash, c, cpp, csharp, css, go, haskell, java, javascript, json, julia, kotlin, latex, markdown, matlab,
  python, r, rust, shell, sql, typescript, xml, yaml }
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang)

/** [[note:12|Label]] / [[lecture:3|Label]]: the id is what counts, the label is a fallback once the target is gone */
export const REF = /\[\[(note|lecture):(\d+)(?:\|([^\]\n]*))?\]\]/

export interface RefTarget { label: string; hint: string; color?: string }
export interface RefLookup {
  note(id: number): RefTarget | undefined
  lecture(id: number): RefTarget | undefined
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const tex = (src: string, displayMode: boolean) =>
  katex.renderToString(src, { displayMode, throwOnError: false, output: 'htmlAndMathml' })

let lookup: RefLookup = { note: () => undefined, lecture: () => undefined }

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: src => src.match(/^\$\$/m)?.index,
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src)
    if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() }
  },
  renderer: t => `<div class="math-block">${tex(t.text, true)}</div>\n`,
}

// $…$ follows pandoc: no space just inside the dollars and no digit right after, so "$5 and $10" stays text
const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: src => { const i = src.indexOf('$'); return i < 0 ? undefined : i },
  tokenizer(src) {
    const display = /^\$\$([\s\S]+?)\$\$/.exec(src)
    if (display) return { type: 'inlineMath', raw: display[0], text: display[1].trim(), display: true }
    const m = /^\$(?!\s)((?:\\[\s\S]|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src)
    if (m) return { type: 'inlineMath', raw: m[0], text: m[1], display: false }
  },
  renderer: t => tex(t.text, t.display),
}

const ref: TokenizerAndRendererExtension = {
  name: 'ref',
  level: 'inline',
  start: src => { const i = src.indexOf('[['); return i < 0 ? undefined : i },
  tokenizer(src) {
    const m = new RegExp('^' + REF.source).exec(src)
    if (m) return { type: 'ref', raw: m[0], kind: m[1], id: Number(m[2]), label: m[3] ?? '' }
  },
  renderer(t) {
    const target = t.kind === 'note' ? lookup.note(t.id) : lookup.lecture(t.id)
    if (!target) return `<span class="ref broken" title="This ${t.kind} was deleted">${esc(t.label || t.kind)}</span>`
    const cls = t.kind === 'lecture' ? `ref ref-lecture c-${target.color}` : 'ref'
    return `<a href="#" class="${cls}" data-${t.kind}="${t.id}" title="${esc(target.hint)}">${esc(target.label)}</a>`
  },
}

// ```lang fences: highlighted, with the language and a copy button above the code
function codeBlock({ text, lang }: Tokens.Code) {
  const name = (lang ?? '').trim().split(/\s+/)[0].toLowerCase()
  const language = name ? hljs.getLanguage(name) : undefined
  const html = language ? hljs.highlight(text, { language: name, ignoreIllegals: true }).value : esc(text)
  const label = language?.name ?? (name || 'Text')
  return `<div class="code-block"><div class="code-head"><span>${esc(label)}</span>`
    + `<button type="button" class="code-copy">Copy</button></div>`
    + `<pre><code class="hljs">${html}</code></pre></div>\n`
}

const md = new Marked({ gfm: true }, { extensions: [blockMath, inlineMath, ref], renderer: { code: codeBlock } })

// links written in a note open in a new tab instead of replacing the app
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderMarkdown(src: string, refs: RefLookup): string {
  lookup = refs
  return DOMPurify.sanitize(md.parse(src, { async: false }) as string)
}
