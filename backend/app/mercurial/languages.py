"""Friendly language names and colours for repository paths (U3, repository stats).

Detection is by file name / extension only. Repository content is never executed or parsed
here. Colours follow the widely used GitHub Linguist palette so language bars look familiar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Literal

LanguageKind = Literal["programming", "markup", "data", "prose"]


@dataclass(frozen=True, slots=True)
class Language:
    name: str
    color: str
    kind: LanguageKind


def _lang(name: str, color: str, kind: LanguageKind = "programming") -> Language:
    return Language(name=name, color=color, kind=kind)


PYTHON = _lang("Python", "#3572A5")
JAVASCRIPT = _lang("JavaScript", "#f1e05a")
TYPESCRIPT = _lang("TypeScript", "#3178c6")
C = _lang("C", "#555555")
CPP = _lang("C++", "#f34b7d")
CSHARP = _lang("C#", "#178600")
GO = _lang("Go", "#00ADD8")
RUST = _lang("Rust", "#dea584")
JAVA = _lang("Java", "#b07219")
KOTLIN = _lang("Kotlin", "#A97BFF")
SWIFT = _lang("Swift", "#F05138")
OBJC = _lang("Objective-C", "#438eff")
RUBY = _lang("Ruby", "#701516")
PHP = _lang("PHP", "#4F5D95")
SHELL = _lang("Shell", "#89e051")
POWERSHELL = _lang("PowerShell", "#012456")
BATCH = _lang("Batchfile", "#C1F12E")
PERL = _lang("Perl", "#0298c3")
LUA = _lang("Lua", "#000080")
R = _lang("R", "#198CE7")
SCALA = _lang("Scala", "#c22d40")
HASKELL = _lang("Haskell", "#5e5086")
ELIXIR = _lang("Elixir", "#6e4a7e")
ERLANG = _lang("Erlang", "#B83998")
CLOJURE = _lang("Clojure", "#db5855")
DART = _lang("Dart", "#00B4AB")
ZIG = _lang("Zig", "#ec915c")
OCAML = _lang("OCaml", "#ef7a08")
FSHARP = _lang("F#", "#b845fc")
JULIA = _lang("Julia", "#a270ba")
GROOVY = _lang("Groovy", "#4298b8")
ASSEMBLY = _lang("Assembly", "#6E4C13")
FORTRAN = _lang("Fortran", "#4d41b1")
SQL = _lang("SQL", "#e38c00", "data")
HCL = _lang("HCL", "#844FBA")
NIX = _lang("Nix", "#7e7eff")
MAKEFILE = _lang("Makefile", "#427819")
CMAKE = _lang("CMake", "#DA3434")
DOCKERFILE = _lang("Dockerfile", "#384d54")
VUE = _lang("Vue", "#41b883", "markup")
SVELTE = _lang("Svelte", "#ff3e00", "markup")
HTML = _lang("HTML", "#e34c26", "markup")
CSS = _lang("CSS", "#563d7c", "markup")
SCSS = _lang("SCSS", "#c6538c", "markup")
LESS = _lang("Less", "#1d365d", "markup")
XML = _lang("XML", "#0060ac", "data")
SVG = _lang("SVG", "#ff9900", "data")
JSON = _lang("JSON", "#292929", "data")
YAML = _lang("YAML", "#cb171e", "data")
TOML = _lang("TOML", "#9c4221", "data")
INI = _lang("INI", "#d1dbe0", "data")
CSV = _lang("CSV", "#237346", "data")
PROTOBUF = _lang("Protocol Buffer", "#5a5a5a", "data")
GRAPHQL = _lang("GraphQL", "#e10098", "data")
MARKDOWN = _lang("Markdown", "#083fa1", "prose")
RST = _lang("reStructuredText", "#141414", "prose")
TEXT = _lang("Text", "#cccccc", "prose")

_BY_EXTENSION: dict[str, Language] = {
    "py": PYTHON,
    "pyi": PYTHON,
    "pyw": PYTHON,
    "js": JAVASCRIPT,
    "mjs": JAVASCRIPT,
    "cjs": JAVASCRIPT,
    "jsx": JAVASCRIPT,
    "ts": TYPESCRIPT,
    "tsx": TYPESCRIPT,
    "mts": TYPESCRIPT,
    "cts": TYPESCRIPT,
    "c": C,
    "h": C,
    "cc": CPP,
    "cpp": CPP,
    "cxx": CPP,
    "c++": CPP,
    "hh": CPP,
    "hpp": CPP,
    "hxx": CPP,
    "ipp": CPP,
    "cs": CSHARP,
    "go": GO,
    "rs": RUST,
    "java": JAVA,
    "kt": KOTLIN,
    "kts": KOTLIN,
    "swift": SWIFT,
    "m": OBJC,
    "mm": OBJC,
    "rb": RUBY,
    "php": PHP,
    "sh": SHELL,
    "bash": SHELL,
    "zsh": SHELL,
    "fish": SHELL,
    "ps1": POWERSHELL,
    "psm1": POWERSHELL,
    "bat": BATCH,
    "cmd": BATCH,
    "pl": PERL,
    "pm": PERL,
    "lua": LUA,
    "r": R,
    "scala": SCALA,
    "hs": HASKELL,
    "ex": ELIXIR,
    "exs": ELIXIR,
    "erl": ERLANG,
    "hrl": ERLANG,
    "clj": CLOJURE,
    "cljs": CLOJURE,
    "dart": DART,
    "zig": ZIG,
    "ml": OCAML,
    "mli": OCAML,
    "fs": FSHARP,
    "fsx": FSHARP,
    "jl": JULIA,
    "groovy": GROOVY,
    "gradle": GROOVY,
    "s": ASSEMBLY,
    "asm": ASSEMBLY,
    "f90": FORTRAN,
    "f95": FORTRAN,
    "sql": SQL,
    "tf": HCL,
    "hcl": HCL,
    "nix": NIX,
    "mk": MAKEFILE,
    "cmake": CMAKE,
    "vue": VUE,
    "svelte": SVELTE,
    "html": HTML,
    "htm": HTML,
    "css": CSS,
    "scss": SCSS,
    "less": LESS,
    "xml": XML,
    "xsd": XML,
    "xsl": XML,
    "svg": SVG,
    "json": JSON,
    "jsonc": JSON,
    "yaml": YAML,
    "yml": YAML,
    "toml": TOML,
    "ini": INI,
    "cfg": INI,
    "csv": CSV,
    "tsv": CSV,
    "proto": PROTOBUF,
    "graphql": GRAPHQL,
    "gql": GRAPHQL,
    "md": MARKDOWN,
    "markdown": MARKDOWN,
    "rst": RST,
    "txt": TEXT,
}

_BY_FILENAME: dict[str, Language] = {
    "makefile": MAKEFILE,
    "gnumakefile": MAKEFILE,
    "cmakelists.txt": CMAKE,
    "dockerfile": DOCKERFILE,
    "containerfile": DOCKERFILE,
    "gemfile": RUBY,
    "rakefile": RUBY,
    "readme": TEXT,
}

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "gif", "webp"})
FONT_EXTENSIONS = frozenset({"ttf", "otf", "woff", "woff2", "eot"})


def extension_of(path: str) -> str:
    return PurePosixPath(path).suffix.lstrip(".").lower()


def detect_language(path: str) -> Language | None:
    name = PurePosixPath(path).name.lower()
    by_name = _BY_FILENAME.get(name)
    if by_name is not None:
        return by_name
    if name.startswith("dockerfile."):
        return DOCKERFILE
    return _BY_EXTENSION.get(extension_of(path))


def language_name(path: str) -> str | None:
    language = detect_language(path)
    return language.name if language is not None else None
