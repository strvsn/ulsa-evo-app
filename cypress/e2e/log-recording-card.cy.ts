describe('log recording card layout', () => {
  for (const scenario of ['card', 'browser', 'dual'] as const) {
    it(`fits ${scenario} status at phone widths`, () => {
      for (const width of [320, 360, 375, 393, 430]) {
        cy.viewport(width, 852);
        cy.visit(`/cypress/log-recording-harness.html?scenario=${scenario}`);
        cy.get('.log-recording-card').then(($card) => {
          const card = $card[0];
          const content = card.querySelector<HTMLElement>('.log-recording-card-content')!;
          expect(card.scrollWidth, `${width}px card overflow`).to.be.at.most(card.clientWidth + 1);
          expect(content.scrollWidth, `${width}px content overflow`).to.be.at.most(content.clientWidth + 1);
          card.querySelectorAll<HTMLElement>('.log-recording-card-destination-label').forEach((label) => {
            expect(label.scrollWidth, `${width}px ${label.textContent} overflow`)
              .to.be.at.most(label.clientWidth + 1);
          });
          const elapsed = card.querySelector<HTMLElement>('.log-recording-card-elapsed-metric');
          expect(Boolean(elapsed), `${scenario} elapsed visibility`).to.equal(scenario !== 'card');
          if (elapsed) {
            const action = card.querySelector<HTMLElement>('.log-recording-card-action')!;
            expect(elapsed.getBoundingClientRect().right, `${width}px elapsed/action overlap`)
              .to.be.at.most(action.getBoundingClientRect().left + 0.5);
          }
        });
      }
    });
  }

  it('shows the selected unavailable Card and reason without overflowing a phone', () => {
    for (const width of [320, 360, 393, 430]) {
      cy.viewport(width, 852);
      cy.visit('/cypress/log-recording-harness.html?scenario=unavailable');
      cy.get('.log-recording-card').then(($card) => {
        const card = $card[0];
        expect(card.scrollWidth, `${width}px card overflow`).to.be.at.most(card.clientWidth + 1);
      });
      cy.get('.log-recording-card-destination.is-selected.is-disabled')
        .should('have.attr', 'aria-pressed', 'true');
      cy.get('.log-recording-card-disabled-reason').should('contain', 'カードが検出されていません');
    }
  });
});
