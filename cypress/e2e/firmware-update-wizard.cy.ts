const luminance = ([r, g, b]: number[]) => {
  const channel = (n: number) => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722;
};
const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

describe('Unified OTA real-browser review', () => {
  for (const target of ['ESP32', 'STM32']) {
    for (const theme of ['light', 'dark']) {
      it(`copies ${target} Wi-Fi password from a 44px tap target in ${theme}`, () => {
        cy.viewport(360, 800);
        cy.visit(`/cypress/firmware-update-harness.html?stage=manualWifi&target=${target}&theme=${theme}`, {
          onBeforeLoad(win) {
            Object.defineProperty(win.navigator, 'clipboard', {
              configurable: true, value: { writeText: cy.stub().resolves().as('copyPassword') },
            });
          },
        });
        cy.get('html[data-ota-presented="true"]').should('exist');
        cy.get('button[aria-label="Wi-Fiパスワードをコピー"]').scrollIntoView().should('be.visible')
          .then(($button) => {
            const rect = $button[0].getBoundingClientRect();
            expect(rect.height, 'tap target height').to.be.at.least(44);
            expect(rect.width, 'tap target width').to.be.at.least(44);
          }).click();
        cy.get('@copyPassword').should('have.been.calledOnceWithExactly', 'example-password');
        cy.get('.firmware-update-copy-message').should('be.visible').and('have.text', 'パスワードをコピーしました');
        cy.get('.firmware-update-primary').should('be.visible').and('have.text', '接続を確認');
        if (target === 'ESP32' && theme === 'light') cy.screenshot('ota-web-wifi-password-copy', { capture: 'viewport' });
      });
    }
  }

  it('keeps credentials readable and reports copy denial during Web connection retry', () => {
    cy.viewport(320, 568);
    cy.visit('/cypress/firmware-update-harness.html?stage=error&target=STM32&webRetry=true', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true, value: { writeText: cy.stub().rejects(new DOMException('Denied', 'NotAllowedError')) },
        });
      },
    });
    cy.get('html[data-ota-presented="true"]').should('exist');
    cy.get('button[aria-label="Wi-Fiパスワードをコピー"]').scrollIntoView().click();
    cy.get('.firmware-update-copy-message').should('be.visible')
      .and('have.text', 'コピーできませんでした。パスワードを手入力してください。');
    cy.get('.firmware-update-copy-password').should('contain.text', 'example-password');
    cy.get('.firmware-update-primary').should('be.visible');
  });

  for (const target of ['ESP32', 'STM32']) {
    it(`uses only a ring for ${target} preparation and a bar for actual updating`, () => {
      cy.viewport(393, 852);
      cy.visit(`/cypress/firmware-update-harness.html?stage=checking&target=${target}&progress=100`);
      cy.get('html[data-ota-presented="true"]').should('exist');
      cy.contains('h2', '更新の準備をしています').should('be.visible');
      cy.get('.firmware-update-progress').should('not.exist');
      cy.get('[role="progressbar"]').should('not.exist');
      cy.get('.firmware-update-progress-ring').should('be.visible');
      cy.screenshot(`ota-preparation-ring-only-${target}`, { capture: 'viewport' });
      cy.visit(`/cypress/firmware-update-harness.html?stage=updating&target=${target}&progress=42`);
      cy.get('html[data-ota-presented="true"]').should('exist');
      cy.get('[role="progressbar"]').should('be.visible').and('have.attr', 'aria-valuenow', '42');
      cy.get('.firmware-update-progress strong').should('have.text', '42%');
    });
  }

  for (const width of [320, 393, 1024]) {
    it(`retains Web Wi-Fi credentials and reachable controls after denial at ${width}px`, () => {
      cy.viewport(width, 768);
      cy.visit('/cypress/firmware-update-harness.html?stage=error&target=STM32&webRetry=true');
      cy.get('html[data-ota-presented="true"]').should('exist');
      cy.get('.firmware-update-wifi').should('contain.text', 'ULSA-EVO-OTA-A1B')
        .and('contain.text', 'example-password');
      cy.get('.firmware-update-error').should('contain.text', 'サイトの設定でアクセスを許可');
      cy.get('.firmware-update-error').then(($error) => {
        expect($error[0].compareDocumentPosition($error[0].parentElement!.querySelector('.firmware-update-wifi')!)
          & Node.DOCUMENT_POSITION_FOLLOWING).to.be.greaterThan(0);
      });
      cy.get('.firmware-update-primary').should('be.visible');
      cy.get('.firmware-update-surface').then(($surface) => {
        const rect = $surface[0].getBoundingClientRect();
        for (const element of Array.from($surface[0].querySelectorAll('p,dt,dd,button'))) {
          const bounds = element.getBoundingClientRect();
          expect(bounds.left, element.textContent ?? '').to.be.at.least(rect.left - 1);
          expect(bounds.right, element.textContent ?? '').to.be.at.most(rect.right + 1);
        }
      });
      cy.get('.firmware-update-close').click();
      cy.get('ion-modal.firmware-update-modal').should('not.have.class', 'show-modal');
    });
  }

  it('anchors estimated progress at 12 o’clock and keeps user waits indeterminate', () => {
    cy.viewport(393, 852);
    cy.visit('/cypress/firmware-update-harness.html?stage=connection&phase=wifi&remaining=9&autoJoin=true');
    cy.get('html[data-ota-presented="true"]').should('exist');
    cy.get('.firmware-update-progress-ring').should('be.visible').then(($ring) => {
      const style = $ring[0].ownerDocument.defaultView!.getComputedStyle($ring[0]);
      expect(style.getPropertyValue('--firmware-progress').trim()).to.equal('50%');
      expect(style.backgroundImage).to.include('conic-gradient');
      expect(style.transform).to.equal('none');
    });

    cy.visit('/cypress/firmware-update-harness.html?stage=button&phase=physicalAuth&autoJoin=true');
    cy.get('html[data-ota-presented="true"]').should('exist');
    cy.get('.firmware-update-progress-ring').should('not.exist');
    cy.get('.firmware-update-footer ion-spinner').should('be.visible');
  });

  for (const target of ['ESP32', 'STM32']) {
    it(`dismisses ${target} from every stage, including connection and completion`, () => {
      cy.viewport(393, 852);
      for (const stage of ['download', 'button', 'connection', 'manualWifi', 'checking', 'ready', 'updating', 'complete', 'canceled', 'error']) {
        cy.visit(`/cypress/firmware-update-harness.html?stage=${stage}&target=${target}`);
        cy.get('ion-modal.firmware-update-modal').should('have.class', 'show-modal');
        cy.get('.firmware-update-close').click();
        cy.get('ion-modal.firmware-update-modal').should('not.have.class', 'show-modal');
      }
      cy.visit(`/cypress/firmware-update-harness.html?stage=complete&target=${target}`);
      cy.get('ion-modal.firmware-update-modal').should('have.class', 'show-modal');
      cy.get('.firmware-update-primary').click();
      cy.get('ion-modal.firmware-update-modal').should('not.have.class', 'show-modal');
    });
  }

  for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 820, height: 1180 }, { width: 852, height: 393 }]) {
    for (const theme of ['light', 'dark']) {
      it(`keeps every stage readable and the footer reachable at ${viewport.width}x${viewport.height} ${theme}`, () => {
        cy.viewport(viewport.width, viewport.height);
        for (const stage of ['buttonPreview', 'button', 'connection', 'manualWifi', 'checking', 'ready', 'updating', 'complete', 'error']) {
          cy.visit(`/cypress/firmware-update-harness.html?stage=${stage}&theme=${theme}&target=STM32`);
          cy.get('.firmware-update-modal').should('be.visible');
          cy.get('html[data-ota-presented="true"]').should('exist');
          cy.get('.firmware-update-stage h2').should('be.visible');
          cy.get('.firmware-update-surface').then(($surface) => {
            const surface = $surface[0];
            const win = surface.ownerDocument.defaultView!;
            const bounds = surface.getBoundingClientRect();
            const failures: string[] = [];
            for (const element of Array.from(surface.querySelectorAll<HTMLElement>('h1,h2,p,small,dt,dd,strong,button'))) {
              const text = element.textContent?.trim();
              if (!text) continue;
              if (element.getBoundingClientRect().width === 0) continue;
              const style = win.getComputedStyle(element);
              let ancestor: HTMLElement | null = element;
              let background = [248, 250, 251];
              while (ancestor) {
                const color = rgb(win.getComputedStyle(ancestor).backgroundColor);
                if (color.length === 3 || color[3] === 1) { background = color; break; }
                ancestor = ancestor.parentElement;
              }
              const ratio = contrast(rgb(style.color), background);
              if (ratio < 4.5) failures.push(`${text}: contrast ${ratio.toFixed(2)}`);
              const rect = element.getBoundingClientRect();
              if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(`${text}: horizontal overflow`);
              if (style.opacity !== '1') failures.push(`${text}: opacity ${style.opacity}`);
            }
            const footer = surface.querySelector('footer')!.getBoundingClientRect();
            expect(footer.bottom, `${stage} footer`).to.be.at.most(win.innerHeight + 1);
            expect(footer.top, `${stage} footer`).to.be.greaterThan(0);
            expect(failures, stage).to.deep.equal([]);
          });
          if (stage === 'updating') {
            cy.get('.firmware-update-progress strong').should('be.visible').then(($percent) => {
              const percent = $percent[0];
              const bar = percent.previousElementSibling!;
              const numberRect = percent.getBoundingClientRect();
              const barRect = bar.getBoundingClientRect();
              const style = percent.ownerDocument.defaultView!.getComputedStyle(percent);
              const footer = percent.closest('.firmware-update-surface')!.querySelector('footer')!.getBoundingClientRect();
              expect(numberRect.top, 'percentage is below the bar').to.be.at.least(barRect.bottom + 8);
              expect(Math.abs((numberRect.left + numberRect.width / 2) - (barRect.left + barRect.width / 2)), 'center aligned').to.be.lessThan(1);
              expect(Number.parseFloat(style.fontSize), 'large percentage').to.be.at.least(32);
              expect(numberRect.bottom, 'percentage above fixed footer').to.be.at.most(footer.top);
              expect(style.textAlign).to.equal('center');
            });
          }
          if (viewport.width === 393 && theme === 'light' && ['button', 'ready', 'updating', 'complete', 'error'].includes(stage)) {
            cy.wait(800); // Approved product-reveal animation, not network timing.
            cy.screenshot(`ota-${stage}-iphone`, { capture: 'viewport' });
          }
        }
      });
    }
  }
});
