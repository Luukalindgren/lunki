/**
 * Automaattinen ohjaaja katsojalle ja isolle näytölle (#564). Kuten
 * e-urheilun lähetyksessä, kuva seuraa sitä kalastajaa, jonka luona tapahtuu:
 * tapahtumat antavat pisteitä, jotka hiipuvat ajan kanssa, ja kuva vaihtuu
 * eniten pisteitä keränneeseen. Lyhin kuva on `minShot`, eikä sama kalastaja
 * palaa kuvaan heti ilman isoa tapahtumaa. Tyhjinä hetkinä kuva kiertää
 * tulostaulun kärjestä hännille, ja välillä näytetään yleiskuva.
 *
 * Puhdas tila-automaatti: sisään tapahtumat, kalastajat ja aika, ulos kuva.
 */

/** Ohjaajan säädöt (s ja pisteet). */
export const DIRECTOR = {
  /** Lyhin kuva: tätä ennen vaihdetaan vain ison tapahtuman takia. */
  minShot: 8,
  /** Pisin kuva ilman tapahtumia: sitten kierto tai yleiskuva. */
  maxShot: 25,
  /** Pisteiden hiipumisen aikavakio: noin 20 sekunnissa tapahtuma on unohtunut. */
  decay: 8,
  /** Sama kalastaja palaa kuvaan vasta näin pian, ellei tapahtuma ole iso. */
  cooldown: 20,
  /**
   * Iso tapahtuma (yhden tapahtuman pisteet): keskeyttää lyhimmänkin kuvan
   * ja ohittaa jäähdyttelyn, kun se on tuore (`bigFresh`).
   */
  big: 60,
  bigFresh: 5,
  /** Isokaan tapahtuma ei leikkaa kuvaa tätä nopeammin: kuva ei poukkoile. */
  minBig: 3,
  /** Näin paljon pisteitä tarvitaan, jotta kuva vaihtuu tapahtuman takia. */
  threshold: 25,
  /**
   * Väsytyksen pisteet sekunnissa. Tahti kasvaa väsytyksen keston mukaan
   * (`fightGrow` pistettä/s jokaiselta sekunnilta, enintään `fightGrowMax` s),
   * koska pitkä väsytys on iso kala (#637): se ohittaa muualla tulevat
   * pikkukalojen tärpit ja pysyy kuvassa nostoon asti. Tasaisella tahdilla
   * pisteet jäivät hiipumisen takia kynnyksen alle.
   */
  fightRate: 4,
  fightGrow: 0.5,
  fightGrowMax: 40,
  /** Väsytys näytetään ensin ylhäältä (rengas ja kala), sitten kalastajan silmin. */
  fightTopFirst: 5,
  /** Yleiskuvan pituus. */
  overview: 10,
  /** Tyhjinä hetkinä yleiskuva enintään näin usein. */
  overviewEvery: 60,
  /** Viimeisen minuutin alussa yleiskuva (jäljellä, s). */
  finalMinute: 60,
  /** Käsiohjaus (←/→, V) pitää kuvan näin kauan, sitten ohjaaja jatkaa. */
  manualHold: 30,
} as const;

/** Tapahtuman pisteet. */
export const DIRECTOR_POINTS = {
  /** Kala tarttui. Pitkä väsytys kerää lisää `fightRate`-pisteitä. */
  fishOn: 50,
  /** Nosto ja punnitus. */
  catch: 40,
  /** Ennätys tai johtoon nousu. */
  record: 80,
  lead: 80,
  /** Siimat sotkussa (molemmille). */
  tangle: 40,
  /** Kaatuminen (iso aalto, trombi) tai salama lähellä. */
  capsize: 70,
  lightning: 70,
} as const;

export type DirectorEventKind = keyof typeof DIRECTOR_POINTS;

/** Miksi kuva on tämä: alaotsikon teksti. */
export type ShotReason = DirectorEventKind | 'fight' | 'rotate' | 'overview' | 'manual';

/** Kuvan rajaus: ylhäältä, kalastajan silmin tai yleiskuva koko kisasta. */
export type ShotView = 'top' | 'pov' | 'overview';

export interface Shot {
  /** Seurattava kalastaja (sessionId); yleiskuvassa null. */
  id: string | null;
  view: ShotView;
  reason: ShotReason;
  /** Kuvan alku (s, kisan kello). */
  since: number;
}

/** Kalastajan tila ohjaajalle. */
export interface DirectorAngler {
  id: string;
  /** Kala kiinni (vieheen vaihe `hooked`). */
  hooked: boolean;
  /** Viehe vedessä tai lennossa: kalastajan silmin näkyy heitto ja kelaus. */
  lureOut: boolean;
}

interface Score {
  value: number;
  at: number;
  /** Viimeisin pisteitä antanut tapahtuma: alaotsikon syy. */
  reason: ShotReason;
  /** Viimeisimmän ison tapahtuman hetki. */
  bigAt: number;
}

export class Director {
  private readonly scores = new Map<string, Score>();
  /** Milloin kalastaja oli viimeksi kuvassa (jäähdyttely). */
  private readonly lastShown = new Map<string, number>();
  /** Väsytyksen alku kalastajittain. */
  private readonly fights = new Map<string, number>();
  private current: Shot = { id: null, view: 'overview', reason: 'overview', since: 0 };
  private lastOverview = 0;
  private finalShown = false;
  private manualUntil = -Infinity;
  /** Kierron edellinen kohta tulostaulussa. */
  private rotateIndex = -1;
  /** Kiertävä kuva vuorotellen ylhäältä ja kalastajan silmin. */
  private rotatePov = false;
  private lastStep = 0;
  /** Kuvassa olevan kalastajan tapahtuma (sotku, kaatuminen) pitää rajauksen tähän asti. */
  private eventUntil = -Infinity;

  get shot(): Shot {
    return this.current;
  }

  /** Käsiohjaus päällä: ←/→ tai V pitää kuvan `manualHold`-ajan. */
  manualActive(now: number): boolean {
    return now < this.manualUntil;
  }

  /** Tapahtuma kalastajille `ids` hetkellä `now`; `bonus` lisää pisteitä (iso kala). */
  event(kind: DirectorEventKind, ids: readonly string[], now: number, bonus = 0): void {
    const points = DIRECTOR_POINTS[kind] + bonus;
    for (const id of ids) {
      this.add(id, points, now, kind);
      // Kuvassa jo olevan kalastajan tapahtuma vaihtaa alaotsikon ja rajauksen.
      if (id === this.current.id && this.current.reason !== 'manual') {
        this.current = { ...this.current, reason: kind };
        this.eventUntil = now + DIRECTOR.minShot;
      }
      if (points >= DIRECTOR.big) this.scores.get(id)!.bigAt = now;
    }
  }

  /** Katsoja valitsi kuvan itse: ohjaaja odottaa `manualHold`-ajan. */
  manual(id: string | null, view: 'top' | 'pov', now: number): void {
    this.manualUntil = now + DIRECTOR.manualHold;
    this.current = { id, view, reason: 'manual', since: now };
    if (id) this.lastShown.set(id, now);
  }

  /**
   * Kuva hetkellä `now`. `anglers` = järvellä olevat kalastajat, `order` =
   * tulostaulun järjestys (kierron järjestys), `left` = kisaa jäljellä (s).
   */
  step(
    now: number,
    anglers: readonly DirectorAngler[],
    order: readonly string[],
    left: number,
  ): Shot {
    const dt = Math.max(0, now - this.lastStep);
    this.lastStep = now;
    const present = new Set(anglers.map((a) => a.id));
    for (const a of anglers) {
      if (!a.hooked) this.fights.delete(a.id);
      else {
        const start = this.fights.get(a.id) ?? now;
        if (!this.fights.has(a.id)) this.fights.set(a.id, now);
        const long = Math.min(DIRECTOR.fightGrowMax, now - start);
        this.add(a.id, (DIRECTOR.fightRate + DIRECTOR.fightGrow * long) * dt, now, 'fight');
      }
    }
    for (const id of this.scores.keys()) if (!present.has(id)) this.scores.delete(id);

    const cur = this.current;
    // Kuvattava lähti: heti uusi kuva.
    const gone = cur.id !== null && !present.has(cur.id);
    if (this.manualActive(now) && !gone) return this.withView(cur, anglers, now);
    if (anglers.length === 0)
      return this.cut({ id: null, view: 'overview', reason: 'overview' }, now);

    const age = now - cur.since;
    const best = this.best(now, cur.id);
    const curScore = cur.id ? this.score(cur.id, now) : 0;
    const big =
      best !== null &&
      this.fresh(best.id, now) &&
      age >= DIRECTOR.minBig &&
      best.value > curScore + DIRECTOR.threshold;

    // Kisan alku ja viimeinen minuutti: yleiskuva, ellei juuri nyt tapahdu isoa.
    if (!this.finalShown && left <= DIRECTOR.finalMinute && left > DIRECTOR.overview && !big) {
      this.finalShown = true;
      return this.overview(now);
    }
    if (cur.view === 'overview') {
      if (big || (age >= DIRECTOR.overview && !gone)) return this.next(best, anglers, order, now);
      if (gone) return this.next(best, anglers, order, now);
      return cur;
    }
    if (gone || big) return this.next(best, anglers, order, now);
    if (age < DIRECTOR.minShot) return this.withView(cur, anglers, now);
    // Tapahtuma toisaalla: vaihdetaan, jos se on kuvattavaa tärkeämpi.
    if (best && best.value >= DIRECTOR.threshold && best.value > curScore)
      return this.next(best, anglers, order, now);
    // Kuvattavan luona tapahtuu yhä (väsytys): pysytään.
    if (curScore >= DIRECTOR.threshold) return this.withView(cur, anglers, now);
    if (age < DIRECTOR.maxShot) return this.withView(cur, anglers, now);
    // Tyhjää: yleiskuva välillä, muuten kierto.
    if (now - this.lastOverview >= DIRECTOR.overviewEvery) return this.overview(now);
    return this.next(null, anglers, order, now);
  }

  /** Paras tapahtuma muualla kuin kuvassa, jäähdyttely huomioiden. */
  private best(now: number, except: string | null): { id: string; value: number } | null {
    let best: { id: string; value: number } | null = null;
    for (const id of this.scores.keys()) {
      if (id === except) continue;
      const value = this.score(id, now);
      const shown = this.lastShown.get(id);
      const cooling = shown !== undefined && now - shown < DIRECTOR.cooldown;
      if (cooling && !this.fresh(id, now)) continue;
      if (!best || value > best.value) best = { id, value };
    }
    return best;
  }

  private next(
    best: { id: string; value: number } | null,
    anglers: readonly DirectorAngler[],
    order: readonly string[],
    now: number,
  ): Shot {
    if (best && best.value >= DIRECTOR.threshold) {
      const reason = this.scores.get(best.id)?.reason ?? 'rotate';
      return this.follow(best.id, reason, anglers, now);
    }
    // Kierto: tulostaulun järjestyksessä seuraava, joka ei ollut juuri kuvassa.
    const ids = order.filter((id) => anglers.some((a) => a.id === id));
    for (const a of anglers) if (!ids.includes(a.id)) ids.push(a.id);
    if (ids.length === 0) return this.overview(now);
    const fresh = (id: string) => {
      const shown = this.lastShown.get(id);
      return shown === undefined || now - shown >= DIRECTOR.cooldown;
    };
    const after = Array.from(
      { length: ids.length },
      (_, k) => (this.rotateIndex + 1 + k) % ids.length,
    );
    const other = after.filter((i) => ids[i] !== this.current.id || ids.length === 1);
    const pick = other.find((i) => fresh(ids[i]!)) ?? other[0] ?? 0;
    this.rotateIndex = pick;
    this.rotatePov = !this.rotatePov;
    return this.follow(ids[pick]!, 'rotate', anglers, now);
  }

  private follow(
    id: string,
    reason: ShotReason,
    anglers: readonly DirectorAngler[],
    now: number,
  ): Shot {
    this.lastShown.set(id, now);
    return this.withView(this.cut({ id, view: 'top', reason }, now), anglers, now);
  }

  private overview(now: number): Shot {
    this.lastOverview = now;
    return this.cut({ id: null, view: 'overview', reason: 'overview' }, now);
  }

  private cut(shot: Omit<Shot, 'since'>, now: number): Shot {
    const same =
      this.current.id === shot.id &&
      this.current.view === shot.view &&
      this.current.reason === shot.reason;
    if (!same) this.current = { ...shot, since: now };
    if (shot.view === 'overview') this.lastOverview = now;
    return this.current;
  }

  /**
   * Rajaus tilanteen mukaan: väsytys ensin ylhäältä (rengas ja kala samassa
   * kuvassa), sitten kalastajan silmin. Kaatuminen, salama ja sotku näkyvät
   * parhaiten ylhäältä. Kiertävä kuva vuorottelee, ja kalastajan silmin
   * katsotaan vain, kun viehe on ulkona.
   */
  private withView(shot: Shot, anglers: readonly DirectorAngler[], now: number): Shot {
    if (!shot.id || shot.reason === 'manual') return shot;
    const a = anglers.find((x) => x.id === shot.id);
    let view: 'top' | 'pov' = 'top';
    let reason: ShotReason = shot.reason;
    const fight = this.fights.get(shot.id);
    const fromAbove = reason === 'tangle' || reason === 'capsize' || reason === 'lightning';
    // Tapahtuma meni ohi ja kala on yhä kiinni: takaisin väsytykseen.
    if (fromAbove && a?.hooked && now - shot.since >= DIRECTOR.minShot && now >= this.eventUntil)
      reason = 'fight';
    if (reason === 'tangle' || reason === 'capsize' || reason === 'lightning') {
      // Näkyvät parhaiten ylhäältä, vaikka kala olisi kiinni.
    } else if (a?.hooked && fight !== undefined) {
      if (reason === 'rotate' || reason === 'fishOn') reason = 'fight';
      view = now - fight >= DIRECTOR.fightTopFirst ? 'pov' : 'top';
    } else {
      // Väsytys päättyi: syyksi tuorein tapahtuma (esim. saalis), muuten kalastaa.
      if (reason === 'fight') {
        const latest = this.scores.get(shot.id)?.reason;
        reason = latest && latest !== 'fight' && latest !== 'fishOn' ? latest : 'rotate';
      }
      if (reason === 'rotate') view = this.rotatePov && a?.lureOut ? 'pov' : 'top';
    }
    if (view !== shot.view || reason !== shot.reason)
      this.current = { ...shot, view, reason, since: shot.since };
    return this.current;
  }

  /** Kalastajalla on tuore iso tapahtuma. */
  private fresh(id: string, now: number): boolean {
    return now - (this.scores.get(id)?.bigAt ?? -Infinity) < DIRECTOR.bigFresh;
  }

  private add(id: string, points: number, now: number, reason: ShotReason): void {
    const value = this.score(id, now) + points;
    const old = this.scores.get(id);
    // Väsytyksen tasaiset pisteet eivät peitä tapahtuman syytä (esim. johtoon nousu).
    const keep = reason === 'fight' && old && old.reason !== 'fight' && this.score(id, now) > 5;
    this.scores.set(id, {
      value,
      at: now,
      reason: keep ? old.reason : reason,
      bigAt: old?.bigAt ?? -Infinity,
    });
  }

  /** Kalastajan pisteet nyt, hiipuneina. */
  score(id: string, now: number): number {
    const s = this.scores.get(id);
    if (!s) return 0;
    return s.value * Math.exp(-Math.max(0, now - s.at) / DIRECTOR.decay);
  }
}
