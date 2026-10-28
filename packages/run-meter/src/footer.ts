export interface FooterMeter {
  readonly label: string
}

export interface FooterMeterOptions {
  read(promptID: string): FooterMeter | undefined
  root?: HTMLElement
}

const footerSelector = '[data-slot="text-part-copy-wrapper"]'
const metaSelector = '[data-slot="text-part-meta"]'
const rowAttribute = "data-message-id"
const rowSelector = `[${rowAttribute}]`
const meterSelector = "[data-opencode-run-meter]"

export function mountFooterMeter(options: FooterMeterOptions) {
  const root = options.root ?? document.documentElement
  let frame: number | undefined

  const schedule = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      update()
    })
  }

  const update = () => {
    for (const footer of root.querySelectorAll<HTMLElement>(footerSelector)) {
      const promptID = footer.closest<HTMLElement>(rowSelector)?.dataset.messageId
      const meta = footer.querySelector<HTMLElement>(metaSelector)
      const existing = footer.querySelector<HTMLElement>(meterSelector)

      if (!promptID || !meta) {
        existing?.remove()
        continue
      }

      const meter = options.read(promptID)
      if (!meter) {
        existing?.remove()
        continue
      }

      const element = existing ?? document.createElement("span")
      if (!existing) {
        element.setAttribute("data-opencode-run-meter", "")
        meta.append(element)
      }
      if (element.textContent !== meter.label) element.textContent = meter.label
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") return schedule()
      if (record.target instanceof Element && record.target.closest(footerSelector)) return schedule()
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element)) continue
        if (node.matches(footerSelector) || node.querySelector(footerSelector)) return schedule()
      }
    }
  })
  observer.observe(root, { attributes: true, attributeFilter: [rowAttribute], childList: true, subtree: true })
  const timer = setInterval(update, 1_000)
  schedule()

  return () => {
    observer.disconnect()
    clearInterval(timer)
    if (frame !== undefined) cancelAnimationFrame(frame)
    for (const element of root.querySelectorAll(meterSelector)) element.remove()
  }
}
