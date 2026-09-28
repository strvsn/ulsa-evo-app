const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

describe('metric card value alignment', () => {
  for (const viewport of viewports) {
    it(`right-aligns built-in and user-selected metrics at ${viewport.width}x${viewport.height}`, () => {
      cy.viewport(viewport.width, viewport.height);
      cy.visit('/cypress/metrics-layout-harness.html');
      cy.get('html[data-metrics-layout-harness="ready"]').should('exist');
      cy.get('.metric-card .metric-value').should('have.length', 5 + DERIVED_METRIC_OPTIONS.length);
      for (const option of DERIVED_METRIC_OPTIONS) {
        cy.contains('.metric-card .metric-label', option.label).should('be.visible');
      }

      cy.get('.metric-card').then(($cards) => {
        const rightInsets: number[] = [];
        const terminalRightByColumn = new Map<number, number[]>();

        Array.from($cards).forEach((card) => {
          const cardElement = card as HTMLElement;
          const value = cardElement.querySelector<HTMLElement>('.metric-value');
          const terminal = value?.querySelector<HTMLElement>('.metric-unit, .metric-empty');
          expect(value, 'metric value row').not.to.equal(null);
          expect(terminal, 'metric terminal value or unit').not.to.equal(null);

          const cardRect = cardElement.getBoundingClientRect();
          const terminalRect = terminal!.getBoundingClientRect();
          const rightInset = cardRect.right - terminalRect.right;
          rightInsets.push(rightInset);

          const columnKey = Math.round(cardRect.left);
          const columnRights = terminalRightByColumn.get(columnKey) ?? [];
          columnRights.push(terminalRect.right);
          terminalRightByColumn.set(columnKey, columnRights);
        });

        expect(Math.max(...rightInsets) - Math.min(...rightInsets), 'card right inset spread')
          .to.be.at.most(0.75);
        terminalRightByColumn.forEach((rights, columnLeft) => {
          expect(Math.max(...rights) - Math.min(...rights), `column ${columnLeft}px right-edge spread`)
            .to.be.at.most(0.75);
        });
      });
    });
  }
});
import { DERIVED_METRIC_OPTIONS } from '../../src/components/derived-metrics/derivedMetricPreferences';
