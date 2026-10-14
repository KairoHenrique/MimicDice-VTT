export function createConfig(): Record<string, any> {
  return {
    debug: { hooks: false, applications: false, sockets: false },
    supportedLanguages: { en: "English", "pt-BR": "Português (Brasil)" },
    ui: {},
    Actor: { documentClass: null, sheetClasses: {}, typeLabels: {}, dataModels: {} },
    Item: { documentClass: null, sheetClasses: {}, typeLabels: {}, dataModels: {} },
    ChatMessage: { documentClass: null },
    Combat: { documentClass: null },
    Scene: { documentClass: null },
    User: { documentClass: null },
    Dice: { rolls: [], terms: {}, types: [], fulfillment: { dice: {}, methods: {} } },
    statusEffects: [],
    fontDefinitions: {},
    defaultFontFamily: "Signika",
    queries: {},
  };
}
