import { usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"

export function RunMeterSettings() {
  const ctx = usePlugin<typeof definition>()
  const placement = ctx.stores.placement

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-tab-title">{ctx.t("settings.title")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">
              {ctx.t("settings.publisher")} · {ctx.t("settings.description")}
            </span>
          </div>
        </div>
      </div>
      <div class="settings-tab-body settings-tab-body--sectioned">
        <section class="settings-section" aria-label={ctx.t("settings.section.placement")}>
          <h3 class="settings-section-title">{ctx.t("settings.section.placement")}</h3>
          <div data-component="settings-list">
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("settings.header")}</div>
                <div data-slot="settings-row-description">{ctx.t("settings.headerDescription")}</div>
              </div>
              <div data-slot="settings-row-control">
                <div data-action="settings-run-meter-header">
                  <ctx.ui.Switch
                    checked={placement.value.header}
                    onChange={(checked) => {
                      placement.update((draft) => {
                        draft.header = checked
                      })
                    }}
                    label={ctx.t("settings.header")}
                    hideLabel
                  />
                </div>
              </div>
            </div>
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("settings.composer")}</div>
                <div data-slot="settings-row-description">{ctx.t("settings.composerDescription")}</div>
              </div>
              <div data-slot="settings-row-control">
                <div data-action="settings-run-meter-composer">
                  <ctx.ui.Switch
                    checked={placement.value.composer}
                    onChange={(checked) => {
                      placement.update((draft) => {
                        draft.composer = checked
                      })
                    }}
                    label={ctx.t("settings.composer")}
                    hideLabel
                  />
                </div>
              </div>
            </div>
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("settings.footer")}</div>
                <div data-slot="settings-row-description">{ctx.t("settings.footerDescription")}</div>
              </div>
              <div data-slot="settings-row-control">
                <div data-action="settings-run-meter-footer">
                  <ctx.ui.Switch
                    checked={placement.value.footer}
                    onChange={(checked) => {
                      placement.update((draft) => {
                        draft.footer = checked
                      })
                    }}
                    label={ctx.t("settings.footer")}
                    hideLabel
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="settings-section" aria-label={ctx.t("settings.section.details")}>
          <h3 class="settings-section-title">{ctx.t("settings.section.details")}</h3>
          <div data-component="settings-list">
            <div data-component="settings-row">
              <div data-slot="settings-row-copy">
                <div data-slot="settings-row-title">{ctx.t("settings.cost")}</div>
                <div data-slot="settings-row-description">{ctx.t("settings.costDescription")}</div>
              </div>
              <div data-slot="settings-row-control">
                <div data-action="settings-run-meter-cost">
                  <ctx.ui.Switch
                    checked={placement.value.cost}
                    onChange={(checked) => {
                      placement.update((draft) => {
                        draft.cost = checked
                      })
                    }}
                    label={ctx.t("settings.cost")}
                    hideLabel
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
