const TOUCH_TARGET_SELECTOR = [
  'button:not(.ble-settings-drawer-backdrop)',
  'ion-button',
  'ion-segment-button',
  'ion-toggle',
  'ion-range',
  'ion-select',
  'summary',
  '.swiper-pagination-bullet',
].join(', ')

const IPAD_VIEWPORTS = [
  { name: '13-inch portrait', width: 1032, height: 1376 },
  { name: '13-inch landscape', width: 1376, height: 1032 },
  { name: 'Stage Manager medium', width: 744, height: 1133 },
  { name: 'compact window', width: 600, height: 900 },
] as const

const INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY = 'ulsa-evo-initial-firmware-onboarding-v1'

type RgbaColor = { r: number; g: number; b: number; a: number }

const parseCssColor = (value: string): RgbaColor => {
  const normalized = value.trim()
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    const expanded = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: 1,
    }
  }
  const channels = normalized.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Unsupported CSS color: ${value}`)
  return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 }
}

const compositeColor = (foreground: RgbaColor, background: RgbaColor): RgbaColor => ({
  r: foreground.r * foreground.a + background.r * (1 - foreground.a),
  g: foreground.g * foreground.a + background.g * (1 - foreground.a),
  b: foreground.b * foreground.a + background.b * (1 - foreground.a),
  a: 1,
})

const relativeLuminance = (color: RgbaColor): number => {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const contrastRatio = (foreground: RgbaColor, background: RgbaColor): number => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

const hideInitialFirmwareOnboarding = (window: Window) => {
  window.localStorage.setItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY, 'hidden')
}

const installIPadSafeArea = (window: Window) => {
  hideInitialFirmwareOnboarding(window)
  const rootStyle = window.document.documentElement.style
  rootStyle.setProperty('--app-safe-area-top', '24px')
  rootStyle.setProperty('--app-safe-area-right', '12px')
  rootStyle.setProperty('--app-safe-area-bottom', '20px')
  rootStyle.setProperty('--app-safe-area-left', '12px')
}

const installResizableIPadWindow = (window: Window) => {
  installIPadSafeArea(window)
  // Cypress 14+ Electron permits the real Fullscreen API, which expands the
  // AUT to the host display and defeats cy.viewport(). This scenario verifies
  // the app-owned overlay during Stage Manager resizing, so keep native browser
  // fullscreen out of the test while preserving the production call path.
  Object.defineProperty(window.document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: () => Promise.resolve(),
  })
  Object.defineProperty(window.document, 'exitFullscreen', {
    configurable: true,
    value: () => Promise.resolve(),
  })
}

const assertVisibleTouchTargets = () => {
  cy.get(TOUCH_TARGET_SELECTOR).filter(':visible').each(($target) => {
    const rect = $target[0].getBoundingClientRect()
    const label = $target.attr('aria-label')
      ?? $target.attr('title')
      ?? $target.text().trim().slice(0, 40)
      ?? $target[0].tagName

    expect(rect.width, `${label} の幅`).to.be.at.least(44)
    expect(rect.height, `${label} の高さ`).to.be.at.least(44)
  })
}

const assertDashboardHorizontalContainment = (viewportWidth: number) => {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth, 'html horizontal overflow').to.be.at.most(viewportWidth + 1)
    expect(document.body.scrollWidth, 'body horizontal overflow').to.be.at.most(viewportWidth + 1)
  })

  cy.get([
    '[data-testid="dashboard-shell"]',
    '.header-logo-container',
    '.status-card',
    '.log-recording-card',
    '.carousel-wrapper',
    '.metrics-fixed',
  ].join(', ')).each(($element) => {
    const rect = $element[0].getBoundingClientRect()
    expect(rect.left, `${$element[0].className} left`).to.be.at.least(-1)
    expect(rect.right, `${$element[0].className} right`).to.be.at.most(viewportWidth + 1)
  })
}

describe('Dashboard', () => {
  it('loads the dashboard from the app root', () => {
    cy.viewport(393, 852)
    cy.visit('/', { onBeforeLoad: hideInitialFirmwareOnboarding })

    cy.location('pathname').should('eq', '/dashboard')
    cy.get('[data-testid="dashboard-shell"]').should('be.visible')
    cy.get('[aria-label="設定メニューを開く"]').should('be.visible')
  })

  it('does not start app logging before a BLE device is connected', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', {
      onBeforeLoad(window) {
        hideInitialFirmwareOnboarding(window)
        window.localStorage.setItem('ulsa-evo.log-recording-mode.v1', 'browser')
      },
    })

    cy.get('[data-testid="log-recording-action"]')
      .should('be.disabled')
      .and('have.attr', 'aria-label', 'BLEデバイスを接続するとログ記録を開始できます')
    cy.get('[data-testid="log-recording-elapsed"]').should('not.exist')
  })

  it('keeps primary touch targets and the settings drawer inside an iPhone-width viewport', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', { onBeforeLoad: hideInitialFirmwareOnboarding })

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      )
    })

    assertVisibleTouchTargets()

    cy.get('[aria-label="設定メニューを開く"]')
      .should('be.visible')
      .then(($button) => {
        const rect = $button[0].getBoundingClientRect()
        expect(rect.width).to.be.at.least(44)
        expect(rect.height).to.be.at.least(44)
      })
      .click()

    cy.get('[role="dialog"][aria-labelledby="ble-settings-drawer-title"]')
      .should('be.visible')
      .then(($drawer) => {
        const rect = $drawer[0].getBoundingClientRect()
        expect(rect.left).to.be.at.least(0)
        expect(rect.right).to.be.at.most(393)
        expect(rect.top).to.be.at.least(0)
        expect(rect.bottom).to.be.at.most(852)
      })

    cy.get('[aria-label="設定カテゴリ"] button').each(($category) => {
      cy.wrap($category).click()
      cy.get('[data-testid="ble-settings-detail"]').then(($detail) => {
        expect($detail[0].scrollWidth).to.be.at.most($detail[0].clientWidth)
      })
      assertVisibleTouchTargets()
    })
  })

  it('aligns BLE/log identities and keeps every log control separate at phone widths', () => {
    for (const width of [320, 360, 375, 393, 430]) {
      cy.viewport(width, 852)
      cy.visit('/dashboard', { onBeforeLoad: hideInitialFirmwareOnboarding })

      cy.get('.status-card').should('be.visible')
      cy.get('.log-recording-card').should('be.visible')
      cy.get('.status-card').then(($status) => {
        const statusIcon = $status[0].querySelector<HTMLElement>('.connection-icon')
        const statusTitle = $status[0].querySelector<HTMLElement>('.status-text')
        expect(statusIcon, `${width}px BLE icon`).not.to.equal(null)
        expect(statusTitle, `${width}px BLE title`).not.to.equal(null)
        cy.get('.log-recording-card').then(($log) => {
          const logIcon = $log[0].querySelector<HTMLElement>('.log-recording-card-icon')
          const logTitle = $log[0].querySelector<HTMLElement>('.log-recording-card-title')
          expect(logIcon, `${width}px log icon`).not.to.equal(null)
          expect(logTitle, `${width}px log title`).not.to.equal(null)

          const statusIconRect = statusIcon!.getBoundingClientRect()
          const statusTitleRect = statusTitle!.getBoundingClientRect()
          const logIconRect = logIcon!.getBoundingClientRect()
          const logTitleRect = logTitle!.getBoundingClientRect()
          expect(logIconRect.left, `${width}px icon x-axis`).to.be.closeTo(statusIconRect.left, 0.75)
          expect(logTitleRect.left, `${width}px title x-axis`).to.be.closeTo(statusTitleRect.left, 0.75)
          expect(
            Math.abs((statusIconRect.top + statusIconRect.bottom) / 2 - (statusTitleRect.top + statusTitleRect.bottom) / 2),
            `${width}px BLE icon/title center`,
          ).to.be.at.most(0.75)
          expect(
            Math.abs((logIconRect.top + logIconRect.bottom) / 2 - (logTitleRect.top + logTitleRect.bottom) / 2),
            `${width}px log icon/title center`,
          ).to.be.at.most(0.75)

          const contentRect = $log[0].querySelector<HTMLElement>('.log-recording-card-content')!
            .getBoundingClientRect()
          const areas = [
            '.log-recording-card-identity',
            '.log-recording-card-destinations',
            '.log-recording-card-action',
          ].map((selector) => ({
            selector,
            rect: $log[0].querySelector<HTMLElement>(selector)!.getBoundingClientRect(),
          }))
          for (const area of areas) {
            expect(area.rect.left, `${width}px ${area.selector} left`).to.be.at.least(contentRect.left - 0.5)
            expect(area.rect.right, `${width}px ${area.selector} right`).to.be.at.most(contentRect.right + 0.5)
            expect(area.rect.top, `${width}px ${area.selector} top`).to.be.at.least(contentRect.top - 0.5)
            expect(area.rect.bottom, `${width}px ${area.selector} bottom`).to.be.at.most(contentRect.bottom + 0.5)
          }
          expect($log[0].querySelector('.log-recording-card-elapsed-metric')).to.equal(null)
          for (let left = 0; left < areas.length; left++) {
            for (let right = left + 1; right < areas.length; right++) {
              const a = areas[left]
              const b = areas[right]
              const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
              const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
              expect(
                overlapX > 0.5 && overlapY > 0.5,
                `${width}px ${a.selector} / ${b.selector} overlap`,
              ).to.equal(false)
            }
          }

          for (const selector of ['.log-recording-card-destination', '.log-recording-card-action']) {
            $log[0].querySelectorAll<HTMLElement>(selector).forEach((control) => {
              const rect = control.getBoundingClientRect()
              expect(rect.width, `${width}px ${selector} width`).to.be.at.least(44)
              expect(rect.height, `${width}px ${selector} height`).to.be.at.least(44)
            })
          }
          const destinationLabels = Array.from(
            $log[0].querySelectorAll<HTMLElement>('.log-recording-card-destination-label'),
          )
          expect(destinationLabels.map((label) => label.textContent?.trim())).to.deep.equal([
            'カード内保存',
            'アプリ内保存',
          ])
          destinationLabels.forEach((label) => {
            expect(label.scrollWidth, `${width}px ${label.textContent} overflow`)
              .to.be.at.most(label.clientWidth + 1)
          })
        })
      })
    }
  })

  it('fully restores the dashboard after closing the BLE connection modal', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', { onBeforeLoad: hideInitialFirmwareOnboarding })

    cy.get('.status-card')
      .should('be.visible')
      .click()

    cy.get('ion-modal.ble-modal').should('have.class', 'show-modal')
    cy.get('.ble-modal ion-header').then(($header) => {
      expect($header[0].getBoundingClientRect().height, 'BLE modal header height').to.be.at.most(72)
    })
    cy.get('.ble-modal ion-toolbar').then(($toolbar) => {
      expect($toolbar[0].getBoundingClientRect().height, 'BLE modal toolbar height').to.be.at.most(64)
    })
    cy.get('[aria-label="BLE接続ダイアログを閉じる"]').click()

    cy.get('ion-modal.ble-modal').should('not.have.class', 'show-modal')
    cy.get('body').should('not.have.class', 'backdrop-no-scroll')
    cy.get('ion-router-outlet').should('not.have.attr', 'aria-hidden', 'true')
    cy.get('[aria-label="設定メニューを開く"]')
      .should('exist')
      .and('not.be.disabled')
  })

  it('fully restores the dashboard after closing the first-run firmware modal', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', {
      onBeforeLoad(window) {
        window.localStorage.removeItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)
      },
    })

    cy.get('ion-modal.initial-firmware-setup-modal').should('have.class', 'show-modal')
    cy.get('ion-modal.initial-firmware-setup-modal h2')
      .should('have.text', 'アプリ接続にはファームウェア更新が必要です')
    cy.get('.initial-setup-intro-copy').should('have.css', 'text-align', 'center')
    cy.get('.initial-setup-consent-list').should('have.css', 'text-align', 'left')
    cy.get('.initial-setup-consent-item').should('have.length', 4)
    cy.get('.initial-setup-hide-checkbox input').check({ force: true })
    cy.get('[aria-label="初回セットアップを閉じる"]').click()

    cy.get('ion-modal.initial-firmware-setup-modal').should('not.have.class', 'show-modal')
    cy.window().its('localStorage').invoke('getItem', INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY).should('eq', 'hidden')
    cy.get('body').should('not.have.class', 'backdrop-no-scroll')
    cy.get('ion-router-outlet').should('not.have.attr', 'aria-hidden', 'true')
    cy.reload()
    cy.get('ion-modal.initial-firmware-setup-modal').should('not.have.class', 'show-modal')
    cy.get('.status-card').should('be.visible').click()
    cy.get('ion-modal.ble-modal').should('have.class', 'show-modal')
  })

  it('persists the hide choice when starting the first-run installation', () => {
    cy.intercept('GET', '**/api/firmware/releases', {
      statusCode: 503,
      body: { error: 'Test firmware catalog unavailable' },
    });
    cy.viewport(393, 852)
    cy.visit('/dashboard', {
      onBeforeLoad(window) {
        window.localStorage.removeItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)
      },
    })

    cy.get('ion-modal.initial-firmware-setup-modal').should('have.class', 'show-modal')
    cy.get('.initial-setup-consent-item input').each(($checkbox) => {
      cy.wrap($checkbox).check({ force: true })
    })
    cy.get('.initial-setup-hide-checkbox input').check({ force: true })
    cy.contains('ion-button', 'インストールを始める').click()

    cy.contains('h2', '更新データを準備しています').should('be.visible')
    cy.window().its('localStorage').invoke('getItem', INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY).should('eq', 'hidden')
    cy.reload()
    cy.get('ion-modal.initial-firmware-setup-modal').should('not.have.class', 'show-modal')
  })

  it('persists the hide choice when the first-run modal is dismissed from its backdrop', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', {
      onBeforeLoad(window) {
        window.localStorage.removeItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY)
      },
    })

    cy.get('ion-modal.initial-firmware-setup-modal').should('have.class', 'show-modal')
    cy.get('.initial-setup-hide-checkbox input').check({ force: true })
    cy.get('ion-modal.initial-firmware-setup-modal').shadow().find('ion-backdrop').click(4, 4, { force: true })

    cy.get('ion-modal.initial-firmware-setup-modal').should('not.have.class', 'show-modal')
    cy.window().its('localStorage').invoke('getItem', INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY).should('eq', 'hidden')
  })

  it('applies the persisted light theme to the full document surface', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', {
      onBeforeLoad(window) {
        hideInitialFirmwareOnboarding(window)
        window.localStorage.setItem('ulsa-evo-theme', 'light')
      },
    })

    cy.get('html[data-ulsa-theme="light"]').should('exist').then(($html) => {
      const htmlStyle = getComputedStyle($html[0])
      const bodyStyle = getComputedStyle($html[0].ownerDocument.body)

      expect(htmlStyle.getPropertyValue('--app-background')).to.include('#f4f8f8')
      expect(htmlStyle.backgroundImage).to.include('linear-gradient')
      expect(bodyStyle.backgroundImage).to.include('linear-gradient')
    })

    assertVisibleTouchTargets()
  })

  it('keeps selected and unselected graph tabs readable in light and dark themes', () => {
    for (const theme of ['slate', 'light']) {
      cy.viewport(393, 852)
      cy.visit('/dashboard', {
        onBeforeLoad(window) {
          hideInitialFirmwareOnboarding(window)
          window.localStorage.setItem('ulsa-evo-theme', theme)
        },
      })

      cy.get('.gauge-segment').then(($segment) => {
        const segmentStyle = getComputedStyle($segment[0])
        const pageBackdrop = parseCssColor(theme === 'light' ? '#ffffff' : '#071019')
        const cardSurface = compositeColor(
          parseCssColor(getComputedStyle($segment[0].closest('.dashboard-content')!).getPropertyValue('--instrument-bg')),
          pageBackdrop,
        )
        const segmentSurface = compositeColor(parseCssColor(segmentStyle.backgroundColor), cardSurface)

        cy.get('.gauge-segment ion-segment-button[value="windSpeed"]').then(($selected) => {
          const selectedStyle = getComputedStyle($selected[0])
          const indicator = compositeColor(
            parseCssColor(selectedStyle.getPropertyValue('--indicator-color')),
            segmentSurface,
          )
          expect(
            contrastRatio(parseCssColor(selectedStyle.color), indicator),
            `${theme} selected tab contrast`,
          ).to.be.at.least(4.5)
          if ($selected[0].classList.contains('md')) {
            expect(selectedStyle.getPropertyValue('--indicator-height').trim()).to.equal('calc(100% - 4px)')
          }
        })

        cy.get('.gauge-segment ion-segment-button[value="temperature"]').then(($unselected) => {
          const unselectedStyle = getComputedStyle($unselected[0])
          expect(
            contrastRatio(parseCssColor(unselectedStyle.getPropertyValue('--color')), segmentSurface),
            `${theme} unselected tab contrast`,
          ).to.be.at.least(4.5)
        })
      })
    }
  })

  for (const viewport of IPAD_VIEWPORTS) {
    it(`fits Dashboard and settings in iPad ${viewport.name} at ${viewport.width}x${viewport.height}`, () => {
      cy.viewport(viewport.width, viewport.height)
      cy.visit('/dashboard', { onBeforeLoad: installIPadSafeArea })

      cy.get('[data-testid="dashboard-shell"]').should('be.visible')
      assertDashboardHorizontalContainment(viewport.width)
      assertVisibleTouchTargets()

      cy.get('[aria-label="設定メニューを開く"]').click()
      cy.get('[role="dialog"][aria-labelledby="ble-settings-drawer-title"]')
        .should('be.visible')
        .then(($drawer) => {
          const rect = $drawer[0].getBoundingClientRect()
          expect(rect.left).to.be.at.least(0)
          expect(rect.right).to.be.at.most(viewport.width)
          expect(rect.top).to.be.at.least(0)
          expect(rect.bottom).to.be.at.most(viewport.height)
        })

      cy.get('[aria-label="設定カテゴリ"] button').each(($category) => {
        cy.wrap($category).click()
        cy.get('[data-testid="ble-settings-detail"]').then(($detail) => {
          expect($detail[0].scrollWidth).to.be.at.most($detail[0].clientWidth)
        })
      })
      assertVisibleTouchTargets()
    })
  }

  it('keeps graph fullscreen usable while an iPad window resizes', () => {
    cy.viewport(1376, 1032)
    cy.visit('/dashboard', { onBeforeLoad: installResizableIPadWindow })

    cy.get('[aria-label="次のカルーセルを表示"]').click()
    cy.get('[aria-label="次のカルーセルを表示"]').click()
    cy.get('[aria-label="グラフを全画面表示"]').should('be.visible').click()
    cy.get('[role="dialog"][aria-label="グラフ全画面"]').should('be.visible')

    cy.viewport(744, 1133)
    cy.get('[role="dialog"][aria-label="グラフ全画面"]')
      .should('be.visible')
      .then(($dialog) => {
        const rect = $dialog[0].getBoundingClientRect()
        expect(rect.left).to.be.at.least(0)
        expect(rect.right).to.be.at.most(744)
        expect(rect.top).to.be.at.least(0)
        expect(rect.bottom).to.be.at.most(1133)
      })

    cy.get('[aria-label="全画面を閉じる"]').click()
    cy.get('[role="dialog"][aria-label="グラフ全画面"]').should('not.exist')
    cy.get('.carousel-pagination').should('have.css', 'position', 'relative')
    cy.get('[aria-label="グラフを全画面表示"]')
      .should('be.visible')
      .should(($button) => {
        const buttonRect = $button[0].getBoundingClientRect()
        const pagination = $button[0].ownerDocument.querySelector<HTMLElement>('.carousel-pagination')
        expect(pagination, 'carousel pagination exists').to.not.equal(null)
        const paginationRect = pagination?.getBoundingClientRect()
        if (paginationRect) {
          expect(buttonRect.bottom, 'fullscreen button stays above pagination').to.be.at.most(paginationRect.top + 1)
        }
      })
    assertDashboardHorizontalContainment(744)
  })

  it('fills a landscape phone with the graph and keeps its close control separate', () => {
    cy.viewport(393, 852)
    cy.visit('/dashboard', { onBeforeLoad: installResizableIPadWindow })

    cy.get('[aria-label="次のカルーセルを表示"]').click()
    cy.get('[aria-label="次のカルーセルを表示"]').click()
    cy.get('[aria-label="グラフを全画面表示"]').click()
    cy.viewport(852, 393)

    cy.get('[role="dialog"][aria-label="グラフ全画面"]').should('be.visible')
    cy.get('.chart-series-legend').should('not.exist')
    cy.get('.chart-container-slide').then(($container) => {
      const containerRect = $container[0].getBoundingClientRect()
      cy.get('.line-chart-surface').then(($surface) => {
        const surfaceRect = $surface[0].getBoundingClientRect()
        expect(surfaceRect.width, 'chart surface fills the container').to.be.at.least(containerRect.width - 1)
        expect(surfaceRect.height, 'chart surface keeps a usable plot height').to.be.greaterThan(140)

        cy.get('.line-chart-surface canvas').should(($canvas) => {
          const canvasRect = $canvas[0].getBoundingClientRect()
          expect(canvasRect.width, 'ECharts canvas fills the surface').to.be.at.least(surfaceRect.width - 1)
          const pixelRatio = $canvas[0].ownerDocument.defaultView?.devicePixelRatio ?? 1
          expect(
            ($canvas[0] as HTMLCanvasElement).width / pixelRatio,
            'ECharts render buffer fills the surface',
          ).to.be.at.least(surfaceRect.width - 1)
        })

        cy.get('.time-scale-buttons').then(($controls) => {
          const controlsRect = $controls[0].getBoundingClientRect()
          expect(surfaceRect.bottom, 'plot ends before controls').to.be.at.most(controlsRect.top + 1)
        })
      })
    })

    cy.get('[aria-label="全画面を閉じる"]')
      .should('be.visible')
      .then(($button) => {
        const rect = $button[0].getBoundingClientRect()
        expect(rect.width).to.be.at.least(44)
        expect(rect.height).to.be.at.least(44)
        expect(rect.right).to.be.at.most(852)
        expect(rect.bottom).to.be.at.most(393)
      })
      .click()
    cy.get('[role="dialog"][aria-label="グラフ全画面"]').should('not.exist')
  })
})
