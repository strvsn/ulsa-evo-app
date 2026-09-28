import {
  collectVisibleShadowGeometry,
  getShadowGeometryFailures,
  getVisibleContentScrollWidth,
} from '../support/drawer-layout-geometry';

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

const iPadViewports = [
  { name: '13-inch portrait', width: 1032, height: 1376 },
  { name: '13-inch landscape', width: 1376, height: 1032 },
  { name: 'Stage Manager medium', width: 744, height: 1133 },
  { name: 'compact window', width: 600, height: 900 },
] as const;

const categories = [
  '概要',
  '表示',
  'FW更新',
  '時刻',
  'カード/ログ',
  '計測設定',
  '情報',
] as const;

const ionicModes = ['ios', 'md'] as const;

const geometrySelectors = [
  '.ble-settings-card',
  '.ble-settings-card-header',
  '.ble-settings-card-header > h3',
  '.ble-settings-card-actions',
  '.ble-settings-card-body',
  '.ble-settings-info-grid',
  '.ble-settings-info-row',
  '.ble-settings-status-line',
  '.ble-settings-status-summary',
  '.ble-settings-status-item',
  '.ble-settings-connection-summary',
  '.ble-settings-message',
  '.ble-settings-message > span',
  '.ble-settings-advanced',
  '.ble-settings-advanced-body',
  '.ble-settings-inline-actions',
  '.appearance-theme-grid',
  '.appearance-theme-option',
  '.appearance-theme-preview',
  '.appearance-theme-copy',
  '.led-brightness-level-selector',
  '.led-brightness-level-readout',
  '.led-brightness-level-axis',
  '.led-wind-reactive-control',
  '.led-wind-reactive-toggle-row',
  '.led-wind-reactive-toggle-copy',
  '.led-wind-reactive-theme-selector',
  '.led-wind-reactive-theme-option',
  '.log-recording-mode-panel',
  '.browser-log-storage-panel',
  '.browser-log-capacity-meter',
  '.browser-log-policy-copy',
  '.browser-log-primary-actions',
  '.browser-log-prepared',
  '.browser-log-session-list',
  '.browser-log-session-item',
  '.browser-log-session-actions',
  '.browser-log-delete-all',
  '.app-information-list',
  '.app-information-actions',
  '.app-information-warning',
  '.card-log-settings-header',
  '.card-log-auto-start-control',
  '.card-log-auto-start-actions',
  '.card-log-settings-controls',
  '.card-log-settings-actions',
  '.card-log-settings-message',
  '.card-log-settings-preview',
  '.i2c-config-list',
  '.i2c-config-actions',
  '.ota-flow',
  '.ota-flow-step-button',
  '.ota-flow-step-index',
  '.ota-flow-step-main',
  '.ota-flow-step-title',
  '.ota-flow-step-detail',
  '.ota-progress-track',
  '.ota-session-copy-actions',
  '.firmware-update-entry',
  'select',
  'ion-item',
  'ion-input',
  'ion-select',
  'ion-range',
  'ion-segment',
  'ion-segment-button',
  'ion-toggle',
  'ion-button',
  'button',
].join(',');

const installCatalogFixtures = () => {
  cy.intercept('GET', '**/api/firmware/releases', {
    statusCode: 200,
    body: {
      releases: [{
        id: 'esp32-layout-test',
        tagName: 'esp32-layout-test',
        title: 'ESP32 layout regression firmware release with a long title',
        publishedAt: '2026-08-08T00:00:00Z',
        size: 102400,
        downloadUrl: '/api/firmware/download?tag=esp32-layout-test',
        latest: true,
      }],
    },
  }).as('esp32Catalog');

  cy.intercept('GET', '**/api/stm32-firmware/releases', {
    statusCode: 200,
    body: {
      releases: [{
        id: 'stm32-layout-test:asset',
        tagName: 'stm32-layout-test',
        title: 'STM32 layout regression firmware release with a long title',
        publishedAt: '2026-08-08T00:00:00Z',
        assetName: 'ULSA_EVO_STM32_F411-20260808-layout-regression-field-preserve.ulsa-stm32pkg',
        target: 'ULSA_EVO_STM32_F411',
        version: '20260808',
        releaseTag: 'stm32-layout-test',
        buildProfile: 'field',
        rdpPolicy: 'preserve',
        requiresAdmin: false,
        size: 251000,
        packageSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        downloadUrl: '/api/stm32-firmware/download?tag=stm32-layout-test&asset=pkg',
        downloadTokenUrl: '/api/stm32-firmware/download-token',
        latest: true,
      }],
    },
  }).as('stm32Catalog');
};

const expectCategoryGeometry = (category: string) => {
  cy.get<HTMLElement>('[data-testid="ble-settings-detail"]').then(($detail) => {
    const detail = $detail[0];
    const detailRect = detail.getBoundingClientRect();
    const tolerance = 1;

    expect(
      detail.scrollWidth,
      `${category}: detail horizontal scroll extent`,
    ).to.be.at.most(detail.clientWidth + tolerance);

    const measured = Array.from(detail.querySelectorAll<HTMLElement>(geometrySelectors))
      .filter((element) => {
        if (element.closest('.browser-log-session-table-wrap')) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

    expect(measured.length, `${category}: measured elements`).to.be.greaterThan(0);

    const geometryFailures: string[] = [];

    for (const element of measured) {
      const rect = element.getBoundingClientRect();
      const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
      const inlineBorders = (Number.parseFloat(computedStyle?.borderLeftWidth ?? '0') || 0)
        + (Number.parseFloat(computedStyle?.borderRightWidth ?? '0') || 0);
      const identity = [
        element.tagName.toLowerCase(),
        element.className && typeof element.className === 'string' ? `.${element.className.trim().replaceAll(' ', '.')}` : '',
      ].join('');

      if (rect.left < detailRect.left - tolerance) {
        geometryFailures.push(`${identity} left=${rect.left.toFixed(1)} detailLeft=${detailRect.left.toFixed(1)}`);
      }
      if (rect.right > detailRect.right + tolerance) {
        geometryFailures.push(`${identity} right=${rect.right.toFixed(1)} detailRight=${detailRect.right.toFixed(1)}`);
      }
      const allowsClippedIonicArtwork = element.matches('ion-toggle, ion-range')
        || (element.matches('ion-segment') && ['hidden', 'clip'].includes(computedStyle?.overflowX ?? ''));
      const visibleScrollWidth = getVisibleContentScrollWidth(element);
      if (
        !allowsClippedIonicArtwork
        && visibleScrollWidth > element.clientWidth + inlineBorders + tolerance
      ) {
        geometryFailures.push(`${identity} scrollWidth=${visibleScrollWidth} clientWidth=${element.clientWidth} borders=${inlineBorders}`);
      }
      if (element.matches('ion-segment')) {
        for (const button of element.querySelectorAll('ion-segment-button')) {
          const walker = element.ownerDocument.createTreeWalker(button, 4);
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.textContent?.trim()) continue;
            const range = element.ownerDocument.createRange();
            range.selectNodeContents(text);
            const textRect = range.getBoundingClientRect();
            if (textRect.width <= 0 || textRect.left < rect.left - tolerance || textRect.right > rect.right + tolerance) {
              geometryFailures.push(`segment label is clipped: ${text.textContent.trim()}`);
            }
          }
        }
      }
    }

    const shadowHostCount = Array.from(detail.querySelectorAll<HTMLElement>('*'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return element.shadowRoot !== null && rect.width > 0 && rect.height > 0;
      })
      .length;
    const shadowGeometry = collectVisibleShadowGeometry(detail);
    if (shadowHostCount > 0) {
      expect(shadowGeometry.length, `${category}: measured shadow elements`).to.be.greaterThan(0);
    }
    geometryFailures.push(...getShadowGeometryFailures(detail, tolerance));

    expect(geometryFailures, `${category}: geometry failures`).to.deep.equal([]);
  });
};

const visitHarness = (
  ionicMode: typeof ionicModes[number],
  scenario: 'connected' | 'disconnected' = 'connected',
  formFactor: 'phone' | 'ipad' = 'phone',
) => {
  cy.visit(`/cypress/drawer-layout-harness.html?mode=${ionicMode}&scenario=${scenario}`, {
    onBeforeLoad: (window) => {
      if (ionicMode !== 'ios') return;
      const safeArea = formFactor === 'ipad'
        ? { top: '24px', right: '12px', bottom: '20px', left: '12px' }
        : { top: '0px', right: '6px', bottom: '34px', left: '0px' };
      window.document.documentElement.style.setProperty('--app-safe-area-top', safeArea.top);
      window.document.documentElement.style.setProperty('--app-safe-area-right', safeArea.right);
      window.document.documentElement.style.setProperty('--app-safe-area-bottom', safeArea.bottom);
      window.document.documentElement.style.setProperty('--app-safe-area-left', safeArea.left);
    },
  });
  cy.get(
    `html[data-drawer-layout-harness="ready"]`
    + `[data-ionic-mode="${ionicMode}"]`
    + `[data-drawer-scenario="${scenario}"]`,
  ).should('exist');
};

const auditAllCategories = (expectDeviceControls: boolean) => {
  cy.get('.ble-settings-nav-item > span').should('have.length', categories.length);
  for (const category of categories) {
    cy.contains('.ble-settings-nav-item > span', category)
      .should('have.text', category)
      .click();
    cy.get('#ble-settings-detail-title').should('have.text', category);
    cy.get<HTMLElement>('[data-testid="ble-settings-detail"]').then(($detail) => {
      $detail[0].querySelectorAll('details').forEach((details) => {
        details.setAttribute('open', '');
      });
    });

    if (category === '計測設定' && expectDeviceControls) {
      cy.get('.led-brightness-level-selector').should('exist');
      cy.get('[data-testid="led-brightness-slider"]')
        .should('have.prop', 'min', 0)
        .and('have.prop', 'max', 7)
        .and('have.prop', 'step', 1);
      cy.get('.led-wind-reactive-theme-selector').should('not.exist');
    }

    expectCategoryGeometry(category);
    if (category === 'カード/ログ') {
      cy.get<HTMLElement>('.browser-log-session-table-wrap').then(($wrap) => {
        const wrap = $wrap[0];
        const detail = wrap.closest<HTMLElement>('[data-testid="ble-settings-detail"]')!;
        const bounds = wrap.getBoundingClientRect();
        const detailBounds = detail.getBoundingClientRect();
        expect(bounds.left).to.be.at.least(detailBounds.left - 1);
        expect(bounds.right).to.be.at.most(detailBounds.right + 1);
        expect(getComputedStyle(wrap).overflowX).to.equal('auto');
        wrap.scrollLeft = wrap.scrollWidth;
        const actions = wrap.querySelectorAll<HTMLElement>('.browser-log-session-actions .control-button');
        expect(actions.length).to.be.greaterThan(0);
        for (const action of actions) {
          action.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const rect = action.getBoundingClientRect();
          const bounds = wrap.getBoundingClientRect();
          expect(rect.left, 'row action reachable after horizontal scroll').to.be.at.least(bounds.left - 1);
          expect(rect.right, 'row action inside the table clip').to.be.at.most(bounds.right + 1);
          expect(rect.height, 'row action touch height').to.be.at.least(44);
          expect(rect.width, 'row action touch width').to.be.at.least(44);
        }
      });
    }
    expectCategoryBottomReachable(category);
  }
};

const expectCategoryBottomReachable = (category: string) => {
  cy.get<HTMLElement>('[data-testid="ble-settings-detail"]').then(($detail) => {
    const detail = $detail[0];
    detail.scrollTop = detail.scrollHeight;
    detail.dispatchEvent(new Event('scroll'));
  });

  cy.get<HTMLElement>('[data-testid="ble-settings-detail"]').then(($detail) => {
    const detail = $detail[0];
    const tolerance = 2;
    const maxScrollTop = Math.max(0, detail.scrollHeight - detail.clientHeight);
    const cards = Array.from(detail.querySelectorAll<HTMLElement>('.ble-settings-card'));
    const lastCard = cards.at(-1);

    expect(detail.scrollTop, `${category}: detail reaches max scroll`).to.be.at.least(maxScrollTop - tolerance);
    expect(lastCard, `${category}: last card exists`).to.not.equal(undefined);
    if (lastCard) {
      expect(
        lastCard.getBoundingClientRect().bottom,
        `${category}: last card is visible after scrolling to the end`,
      ).to.be.at.most(detail.getBoundingClientRect().bottom + tolerance);
    }
  });

  cy.window().its('scrollY').should('equal', 0);
  cy.document().then((document) => {
    const scrollingElement = document.scrollingElement;
    const viewportWidth = document.defaultView?.innerWidth ?? document.documentElement.clientWidth;
    expect(scrollingElement?.scrollTop ?? 0, `${category}: document does not scroll`).to.equal(0);
    expect(document.body.scrollWidth, `${category}: body horizontal overflow`).to.be.at.most(viewportWidth + 1);
  });
};

describe('BLE settings drawer real-browser geometry', () => {
  for (const ionicMode of ionicModes) {
    for (const viewport of viewports) {
      it(`contains all categories in ${ionicMode} mode at ${viewport.width}x${viewport.height}`, () => {
        cy.viewport(viewport.width, viewport.height);
        installCatalogFixtures();
        visitHarness(ionicMode);
        cy.get('[data-testid="ble-settings-drawer"]').should('be.visible');
        auditAllCategories(true);
      });
    }
  }

  for (const viewport of iPadViewports) {
    it(`contains all categories in iPad ${viewport.name} at ${viewport.width}x${viewport.height}`, () => {
      cy.viewport(viewport.width, viewport.height);
      installCatalogFixtures();
      visitHarness('ios', 'connected', 'ipad');
      cy.get('[data-testid="ble-settings-drawer"]').should('be.visible');
      auditAllCategories(true);
    });
  }

  it('contains every disconnected and unsupported state at 320x568', () => {
    cy.viewport(320, 568);
    installCatalogFixtures();
    visitHarness('ios', 'disconnected');
    cy.get('[data-testid="ble-settings-drawer"]').should('be.visible');
    cy.contains('このブラウザ/デバイスではBLEがサポートされていません').should('be.visible');
    cy.contains('BLE未対応環境での長文エラー表示を検証します').should('be.visible');
    auditAllCategories(false);
  });
});
