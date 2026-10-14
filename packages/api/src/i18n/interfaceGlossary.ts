/**
 * Offline pt-BR glossary for common interface phrases that extensions leave in English. Only whole-phrase matches
 * are translated, so a sentence is never left half English and half Portuguese.
 */
const PT_BR_PHRASES: Readonly<Record<string, string>> = {
  "accept": "aceitar",
  "actor": "ator",
  "actors": "atores",
  "add": "adicionar",
  "add item": "adicionar item",
  "advanced": "avançado",
  "all": "todos",
  "amount": "quantidade",
  "appearance": "aparência",
  "apply": "aplicar",
  "are you sure?": "tem certeza?",
  "back": "voltar",
  "browse": "procurar",
  "buy": "comprar",
  "cancel": "cancelar",
  "character": "personagem",
  "characters": "personagens",
  "clear": "limpar",
  "clear all": "limpar tudo",
  "close": "fechar",
  "color": "cor",
  "colour": "cor",
  "configure": "configurar",
  "confirm": "confirmar",
  "continue": "continuar",
  "copy": "copiar",
  "create": "criar",
  "currency": "moeda",
  "custom": "personalizado",
  "damage": "dano",
  "default": "padrão",
  "delete": "excluir",
  "description": "descrição",
  "details": "detalhes",
  "disable": "desativar",
  "disabled": "desativado",
  "done": "concluído",
  "drop": "soltar",
  "duplicate": "duplicar",
  "edit": "editar",
  "effects": "efeitos",
  "enable": "ativar",
  "enabled": "ativado",
  "equipment": "equipamento",
  "error": "erro",
  "everyone": "todos",
  "export": "exportar",
  "file": "arquivo",
  "filter": "filtrar",
  "folder": "pasta",
  "general": "geral",
  "gm": "mestre",
  "gm only": "só o mestre",
  "height": "altura",
  "hidden": "oculto",
  "hide": "ocultar",
  "icon": "ícone",
  "image": "imagem",
  "import": "importar",
  "info": "informação",
  "inventory": "inventário",
  "item": "item",
  "items": "itens",
  "journal": "diário",
  "level": "nível",
  "loading": "carregando",
  "lock": "travar",
  "locked": "travado",
  "loot": "saque",
  "max": "máx",
  "maximum": "máximo",
  "merchant": "mercador",
  "min": "mín",
  "minimum": "mínimo",
  "name": "nome",
  "new": "novo",
  "next": "próximo",
  "no": "não",
  "none": "nenhum",
  "notes": "notas",
  "off": "desligado",
  "ok": "ok",
  "on": "ligado",
  "open": "abrir",
  "options": "opções",
  "owner": "dono",
  "player": "jogador",
  "players": "jogadores",
  "preview": "pré-visualizar",
  "previous": "anterior",
  "price": "preço",
  "quantity": "quantidade",
  "refresh": "atualizar",
  "reload": "recarregar",
  "remove": "remover",
  "rename": "renomear",
  "reset": "restaurar",
  "reset defaults": "restaurar padrões",
  "roll": "rolar",
  "save": "salvar",
  "save changes": "salvar alterações",
  "scene": "cena",
  "scenes": "cenas",
  "search": "buscar",
  "select": "selecionar",
  "sell": "vender",
  "settings": "configurações",
  "sheet": "ficha",
  "show": "mostrar",
  "size": "tamanho",
  "sort": "ordenar",
  "source": "origem",
  "submit": "enviar",
  "success": "sucesso",
  "target": "alvo",
  "title": "título",
  "token": "token",
  "tokens": "tokens",
  "total": "total",
  "type": "tipo",
  "unlock": "destravar",
  "unlocked": "destravado",
  "update": "atualizar",
  "value": "valor",
  "warning": "aviso",
  "weight": "peso",
  "width": "largura",
  "yes": "sim",
};

const GLOSSARIES: Readonly<Record<string, Readonly<Record<string, string>>>> = { "pt-BR": PT_BR_PHRASES };
const TRAILING_PUNCTUATION = /[\s:.!?…]*$/;

function matchCase(source: string, translated: string): string {
  if (source.length > 1 && source === source.toUpperCase()) return translated.toUpperCase();
  const startsUpper = source[0] !== undefined && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase();
  return startsUpper ? translated[0].toUpperCase() + translated.slice(1) : translated;
}

/** Returns the glossary translation of a whole English phrase, or null when it is not a known phrase. */
export function translateInterfacePhrase(text: string, language: string): string | null {
  const glossary = GLOSSARIES[language];
  if (!glossary) return null;
  const trimmed = text.trim();
  const punctuation = TRAILING_PUNCTUATION.exec(trimmed)?.[0] ?? "";
  const core = trimmed.slice(0, trimmed.length - punctuation.length);
  if (!core) return null;
  const byCore = glossary[core.toLowerCase()];
  if (byCore !== undefined) return matchCase(core, byCore) + punctuation;
  const byWholeText = glossary[trimmed.toLowerCase()];
  return byWholeText === undefined ? null : matchCase(trimmed, byWholeText);
}

export function hasInterfaceGlossary(language: string): boolean {
  return language in GLOSSARIES;
}
