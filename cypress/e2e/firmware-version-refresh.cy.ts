describe('Firmware version refresh feedback', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/firmware/releases', { releases: [] });
    cy.intercept('GET', '**/api/stm32-firmware/releases', { releases: [] });
  });

  for (const width of [320, 393, 1024]) {
    it(`keeps firmware refresh busy/failure states readable at ${width}px`, () => {
      cy.viewport(width, 852);
      cy.visit('/cypress/drawer-layout-harness.html?mode=ios&firmwareRefresh=busy');
      cy.get('html[data-drawer-layout-harness="ready"]').should('exist');
      cy.contains('.ble-settings-nav-item > span', 'FW更新').click();
      cy.contains('button', 'バージョンを取得中…').should('be.disabled');
      cy.visit('/cypress/drawer-layout-harness.html?mode=ios&firmwareRefresh=error');
      cy.get('html[data-drawer-layout-harness="ready"]').should('exist');
      cy.contains('.ble-settings-nav-item > span', 'FW更新').click();
      cy.contains('[role="alert"]', 'ESP32のバージョンを取得できませんでした').should('be.visible');
      cy.contains('button', 'バージョンを再確認').should('be.enabled');
      cy.get('[data-testid="ble-settings-detail"]').then(($detail) => {
        const bounds = $detail[0].getBoundingClientRect();
        for (const element of Array.from($detail[0].querySelectorAll('[role="alert"],.ble-settings-action-button'))) {
          const rect = element.getBoundingClientRect();
          expect(rect.left).to.be.at.least(bounds.left - 1);
          expect(rect.right).to.be.at.most(bounds.right + 1);
        }
      });
    });
  }
});
