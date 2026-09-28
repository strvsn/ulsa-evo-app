const INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY = 'ulsa-evo-initial-firmware-onboarding-v1';

const hideInitialFirmwareOnboarding = (window: Window) => {
  window.localStorage.setItem(INITIAL_FIRMWARE_ONBOARDING_STORAGE_KEY, 'hidden');
};

const expect44px = (selector: string) => {
  cy.get(selector).each(($control) => {
    expect($control[0].getBoundingClientRect().height, selector).to.be.closeTo(44, 0.5);
  });
};

describe('44px control height normalization', () => {
  it('keeps graph tabs, gauge controls, and BLE primary actions at 44px', () => {
    cy.viewport(393, 852);
    cy.visit('/dashboard', { onBeforeLoad: hideInitialFirmwareOnboarding });

    cy.get('.status-card').click();
    cy.get('ion-modal.ble-modal').should('be.visible');
    expect44px('.ble-modal-footer > ion-button');
    cy.get('.ble-modal-close').click();

    cy.get('[aria-label="次のカルーセルを表示"]').click();
    expect44px('.gauge-control-button');

    cy.get('[aria-label="次のカルーセルを表示"]').click();
    expect44px('.chart-segment');
    expect44px('.chart-segment ion-segment-button');
    cy.get('.chart-segment ion-segment-button[value="temperature"] ion-label')
      .should('have.text', '音仮温度')
      .then(($label) => {
        expect($label[0].scrollWidth, '音仮温度 tab overflow')
          .to.be.at.most($label[0].clientWidth + 1);
      });
    cy.get('.line-chart-surface canvas').should('be.visible');
    cy.get('.line-chart-surface').then(($surface) => {
      const surfaceRect = $surface[0].getBoundingClientRect();
      cy.get('.time-scale-buttons').then(($controls) => {
        const controlsRect = $controls[0].getBoundingClientRect();
        expect(surfaceRect.bottom, 'portrait plot ends before controls')
          .to.be.at.most(controlsRect.top + 1);
      });
    });
    cy.viewport(320, 568);
    cy.get('.chart-segment ion-segment-button[value="temperature"] ion-label')
      .should('have.text', '音仮温度')
      .then(($label) => {
        expect($label[0].scrollWidth, '320px 音仮温度 tab overflow')
          .to.be.at.most($label[0].clientWidth + 1);
      });
  });

  it('keeps firmware selection and preparation controls at 44px', () => {
    cy.viewport(393, 852);
    cy.visit('/cypress/drawer-layout-harness.html?mode=ios&scenario=connected');
    cy.get('html[data-drawer-layout-harness="ready"]').should('exist');
    cy.contains('.ble-settings-nav-item > span', 'FW更新').click();

    expect44px('.firmware-release-select');
    expect44px('.firmware-update-entry-primary');
  });
});
