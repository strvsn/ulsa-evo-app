const visitHarness = (scenario: 'connected' | 'disconnected' = 'disconnected') => {
  cy.viewport(393, 852);
  cy.visit(`/cypress/drawer-layout-harness.html?mode=ios&scenario=${scenario}`);
  cy.get('html[data-drawer-layout-harness="ready"][data-ionic-mode="ios"]')
    .should('exist');
};

describe('settings drawer compact actions', () => {
  it('draws one rounded surface for measurement and time save buttons in the light theme', () => {
    cy.viewport(393, 852);
    cy.visit('/cypress/drawer-layout-harness.html?mode=ios&scenario=connected&theme=light');
    cy.get('.ble-settings-drawer-light').should('exist');

    const expectSingleRoundedSurface = (selector: string) => {
      cy.get(selector).each(($button) => {
        const host = $button[0];
        const nativeButton = host.shadowRoot?.querySelector('button');
        expect(nativeButton, 'Ionic button surface').not.to.equal(null);
        expect(getComputedStyle(host).borderTopWidth, 'outer border').to.equal('0px');
        expect(getComputedStyle(host).backgroundColor, 'outer background').to.equal('rgba(0, 0, 0, 0)');
        expect(getComputedStyle(host).boxShadow, 'outer shadow').to.equal('none');
        expect(Number.parseFloat(getComputedStyle(nativeButton!).borderTopLeftRadius), 'button corner radius')
          .to.be.greaterThan(0);
      });
    };

    cy.contains('.ble-settings-nav-item > span', '計測設定').click();
    expectSingleRoundedSurface('.i2c-config-row ion-button.device-setting-save');

    cy.contains('.ble-settings-nav-item > span', '時刻').click();
    expectSingleRoundedSurface('ion-button[data-testid="rtc-time-sync"]');
  });

  it('keeps inline controls compact without shrinking the 44px touch target', () => {
    visitHarness();

    cy.contains('.ble-settings-nav-item > span', '計測設定').click();
    cy.get('.i2c-config-actions > ion-button.control-button')
      .should('have.length', 2)
      .each(($button) => {
        const button = $button[0];
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);

        expect(rect.height, button.textContent?.trim()).to.be.at.least(44);
        expect(rect.height, button.textContent?.trim()).to.be.at.most(45);
        expect(rect.width, button.textContent?.trim()).to.be.at.least(44);
        expect(style.marginTop).to.equal('0px');
        expect(style.marginBottom).to.equal('0px');
        expect(Number.parseFloat(style.fontSize)).to.be.within(12, 16);
        expect(rect.width, 'inline action is not a full-width primary action')
          .to.be.lessThan(button.parentElement!.getBoundingClientRect().width);
      });
  });

  it('does not compact full-width primary actions', () => {
    visitHarness();

    cy.contains('.ble-settings-nav-item > span', '情報').click();
    cy.contains('.app-information-actions ion-button', '初回セットアップガイド')
      .should('have.css', 'width')
      .then(() => {
        cy.get('.app-information-actions ion-button').first().then(($button) => {
          const button = $button[0];
          const parent = button.parentElement;
          const style = getComputedStyle(button);

          expect(parent).not.to.equal(null);
          expect(button.getBoundingClientRect().width)
            .to.be.closeTo(parent!.getBoundingClientRect().width, 0.5);
          expect(Number.parseFloat(style.fontSize)).to.be.greaterThan(12);
        });
      });
  });

  it('aligns measurement fields with their apply buttons and hides the unsafe I2C address editor', () => {
    visitHarness('connected');

    cy.contains('.ble-settings-nav-item > span', '計測設定').click();
    cy.contains('センサーを見分けるため、0〜255の任意の番号を設定できます。')
      .should('be.visible');
    cy.get('[data-testid="i2c-address-input"]').should('not.exist');
    cy.contains('I2C Address').should('not.exist');

    cy.get('.i2c-config-row').should('have.length', 3).each(($row) => {
      const field = $row[0].querySelector<HTMLElement>('ion-input, ion-select');
      const button = $row[0].querySelector<HTMLElement>('.i2c-config-apply');
      expect(field, 'measurement field').not.to.equal(null);
      expect(button, 'apply button').not.to.equal(null);
      expect(field!.getBoundingClientRect().height).to.be.closeTo(44, 0.5);
      expect(button!.getBoundingClientRect().height).to.be.closeTo(44, 0.5);
      expect(button!.getBoundingClientRect().width).to.be.greaterThan(44);
    });
  });
});
