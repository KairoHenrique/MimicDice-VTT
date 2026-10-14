import { DialogV2 } from "../DialogV2";

/** Static helpers of `foundry.applications.settings.SettingsConfig` that packages call after changing settings. */
export class SettingsConfig {
  static async reloadConfirm({ world = false }: { world?: boolean } = {}): Promise<void> {
    const confirmed = await DialogV2.confirm({
      window: { title: "Recarregar necessário" },
      content: `<p>${world ? "Essa mudança afeta todos os jogadores." : "Essa mudança precisa recarregar a página."} Recarregar agora?</p>`,
    });
    if (confirmed) window.location.reload();
  }
}
