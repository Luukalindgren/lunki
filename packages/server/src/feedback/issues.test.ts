import { describe, expect, it } from 'vitest';
import { feedbackIdOf, issueBody, issueTitle } from './issues';

const f = (text: string, name = 'Luuka', context = 'Safari, v1') => ({
  id: 7,
  name,
  text,
  context,
  at: '2026-10-25T14:15:36.000Z',
});

describe('palaute issueksi', () => {
  it('otsikko on ensimmäinen ei-tyhjä rivi lyhennettynä', () => {
    expect(issueTitle(f('\n  Sade kuulostaa  suhinalta\nmuuta'))).toBe(
      'Palaute: Sade kuulostaa suhinalta',
    );
    expect(issueTitle(f('x'.repeat(80)))).toHaveLength('Palaute: '.length + 60);
  });

  it('runko kertoo palautteen tunnuksen ja odottaa validointia', () => {
    const body = issueBody(f('Hei'));
    expect(feedbackIdOf(body)).toBe(7);
    expect(body).toContain('Odottaa Luukan validointia');
    expect(body).toContain('2026-10-25 14:15 UTC');
    expect(feedbackIdOf('tavallinen issue')).toBeNull();
    expect(feedbackIdOf(null)).toBeNull();
  });

  it('pelaajan teksti ei pääse koodilohkosta eikä nimi koodista', () => {
    const body = issueBody(f('```\n@Luukalindgren #1\n````', 'a`@b', 'x`y'));
    expect(body).toContain('`````text\n```\n@Luukalindgren #1\n````\n`````');
    expect(body).toContain('Lähettäjä: `a @b`');
    expect(body).toContain('Tilanne: `x y`');
  });

  it('nimetön lähettäjä', () => {
    expect(issueBody(f('Hei', ''))).toContain('Lähettäjä: nimetön');
  });
});
