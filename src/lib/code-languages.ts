/** Languages offered by the code block picker: Markdown fence name and display label. */
export type CodeLanguage = { id: string; label: string }

const NAMED_LANGUAGES: CodeLanguage[] = [
  { id: 'abap', label: 'ABAP' },
  { id: 'arduino', label: 'Arduino' },
  { id: 'bash', label: 'Bash' },
  { id: 'basic', label: 'BASIC' },
  { id: 'c', label: 'C' },
  { id: 'clojure', label: 'Clojure' },
  { id: 'coffeescript', label: 'CoffeeScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'diff', label: 'Diff' },
  { id: 'dockerfile', label: 'Docker' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'elm', label: 'Elm' },
  { id: 'erlang', label: 'Erlang' },
  { id: 'fortran', label: 'Fortran' },
  { id: 'fsharp', label: 'F#' },
  { id: 'gherkin', label: 'Gherkin' },
  { id: 'glsl', label: 'GLSL' },
  { id: 'go', label: 'Go' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'groovy', label: 'Groovy' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'julia', label: 'Julia' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'less', label: 'Less' },
  { id: 'lisp', label: 'Lisp' },
  { id: 'lua', label: 'Lua' },
  { id: 'makefile', label: 'Makefile' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'matlab', label: 'MATLAB' },
  { id: 'mermaid', label: 'Mermaid' },
  { id: 'nix', label: 'Nix' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'ocaml', label: 'OCaml' },
  { id: 'pascal', label: 'Pascal' },
  { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'prolog', label: 'Prolog' },
  { id: 'protobuf', label: 'Protocol Buffers' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'sass', label: 'Sass' },
  { id: 'scala', label: 'Scala' },
  { id: 'scheme', label: 'Scheme' },
  { id: 'scss', label: 'SCSS' },
  { id: 'shell', label: 'Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'toml', label: 'TOML' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'vbnet', label: 'VB.Net' },
  { id: 'verilog', label: 'Verilog' },
  { id: 'vhdl', label: 'VHDL' },
  { id: 'webassembly', label: 'WebAssembly' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
]

export const PLAIN_TEXT: CodeLanguage = { id: '', label: 'Plain text' }

/** Plain text first, then every language alphabetically. */
export const CODE_LANGUAGES: CodeLanguage[] = [
  PLAIN_TEXT,
  ...[...NAMED_LANGUAGES].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })),
]

/** The picker's entries, plus the note's own language when it is not in the list. */
export function languageOptions(current: string) {
  return current && !CODE_LANGUAGES.some((l) => l.id === current)
    ? [...CODE_LANGUAGES, { id: current, label: current }]
    : CODE_LANGUAGES
}

/** Label of the language with this fence name, shown on the picker button. */
export function languageLabel(id: string) {
  return languageOptions(id).find((l) => l.id === id)?.label ?? id
}

/** Languages matching what was typed: names that start with it come before names that contain it. */
export function filterLanguages(options: CodeLanguage[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return options
  const matches = (l: CodeLanguage) => [l.label, l.id].map((text) => text.toLowerCase())
  const starts = options.filter((l) => matches(l).some((text) => text.startsWith(needle)))
  const contains = options.filter((l) => !starts.includes(l) && matches(l).some((text) => text.includes(needle)))
  return [...starts, ...contains]
}
