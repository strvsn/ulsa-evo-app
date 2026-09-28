describe('iOS multi-device connection dialog', () => {
  for (const size of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 1024, height: 768 }, { width: 852, height: 393 }]) {
    for (const theme of ['light', 'dark']) {
      it(`shows six separate cards with reachable controls at ${size.width}x${size.height} ${theme}`, () => {
        cy.viewport(size.width, size.height);
        cy.visit(`/cypress/ble-device-list-harness.html?theme=${theme}`);
        cy.get('html[data-ble-presented="true"]').should('exist');
        cy.get('ion-card.ble-device-card').should('have.length', 6);
        cy.contains('検出デバイス · 6台').should('be.visible');
        cy.get('.ble-modal-page').then(($page) => {
          const background = $page[0].ownerDocument.defaultView!.getComputedStyle($page[0]).backgroundImage;
          expect(background).to.include(theme === 'light' ? '245, 248, 250' : '7, 16, 25');
        });
        if (size.width === 393) cy.screenshot(`ble-six-devices-top-${theme}`, { capture: 'viewport' });
        cy.get('.ble-modal ion-content').then(($content) => {
          const scroll = $content[0].shadowRoot!.querySelector('[part="scroll"]')!;
          expect(scroll.scrollHeight).to.be.greaterThan(scroll.clientHeight);
        });
        cy.get('.ble-modal-footer ion-button').should('be.visible').and('contain.text', '再検索');
        cy.get('.ble-modal-footer').then(($footer) => {
          const rect = $footer[0].getBoundingClientRect();
          expect(rect.bottom).to.be.at.most(size.height + 1);
          expect(rect.top).to.be.greaterThan(0);
        });
        cy.get('.ble-modal ion-content').shadow().find('[part="scroll"]').scrollTo('bottom');
        cy.get('.ble-device-card[data-device-id="fixture-device-6"] .ble-device-connect-button')
          .should('be.visible').then(($button) => {
            expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
          }).click();
        cy.get('[data-testid="selected-device"]').should('have.text', 'fixture-device-6');
        cy.get('.ble-modal-footer ion-button').should('be.visible').click();
        cy.get('[data-testid="rescans"]').should('have.text', '1');
        cy.get('.ble-device-card').should('have.length', 6);
        if (size.width === 393) cy.screenshot(`ble-six-devices-${theme}`, { capture: 'viewport' });
        cy.get('[data-testid="ble-modal-close"]').should('be.visible').click();
        cy.get('ion-modal.ble-modal').should('not.have.class', 'show-modal');
      });
    }
  }
});
