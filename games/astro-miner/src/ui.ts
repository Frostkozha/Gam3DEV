// DOM overlay: HUD pills, hint line, tutorial hand, upgrade cards, popups, flying coins, endcard.

export interface CardView {
  id: string;
  title: string;
  desc: string;
  /** null = maxed out. */
  cost: number | null;
  auto: boolean;
  affordable: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class UI {
  private readonly coinTxt = $('coinTxt');
  private readonly coinsPill = $('coins');
  private readonly lostTxt = $('lostTxt');
  private readonly lostPill = $('lost');
  private readonly hint = $('hint');
  private readonly tutorial = $('tutorial');
  private readonly cards = $('cards');
  private readonly popups = $('popups');
  private readonly endcard = $('endcard');
  private cardsKey = '';
  private hintText = '';
  /** Coin count shown; it catches up as flying coins arrive. */
  private shown = 0;

  onCard: (id: string) => void = () => {};
  onReplay: () => void = () => location.reload();

  constructor() {
    $('loading').remove();
    // Cards are rebuilt when their state changes, so listen once on the container.
    this.cards.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (card && !card.classList.contains('off')) this.onCard(card.dataset.id ?? '');
    });
    $('endBtn').addEventListener('click', () => this.onReplay());
  }

  setCoins(value: number): void {
    this.shown = value;
    this.coinTxt.textContent = String(value);
    this.coinsPill.classList.remove('bump');
    void this.coinsPill.offsetWidth;
    this.coinsPill.classList.add('bump');
  }

  get coinsShown(): number {
    return this.shown;
  }

  setLost(lost: number, max: number, alarm: boolean): void {
    this.lostTxt.textContent = `${lost}/${max}`;
    if (!alarm) return;
    this.lostPill.classList.remove('alarm');
    void this.lostPill.offsetWidth;
    this.lostPill.classList.add('alarm');
  }

  setHint(text: string | null): void {
    const t = text ?? '';
    if (t === this.hintText) return;
    this.hintText = t;
    if (t) this.hint.textContent = t;
    this.hint.classList.toggle('show', !!t);
  }

  showTutorial(on: boolean, text = 'HOLD TO FLY'): void {
    this.tutorial.classList.toggle('hidden', !on);
    const label = this.tutorial.querySelector('.tut-txt');
    if (label) label.textContent = text;
  }

  setCards(list: CardView[]): void {
    const key = JSON.stringify(list);
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    this.cards.innerHTML = list
      .map((c) => {
        const cls = ['card', c.auto ? 'auto' : '', c.cost === null ? 'maxed off' : c.affordable ? 'ready' : 'off'].join(' ');
        const price = c.cost === null ? 'MAX' : `<span class="coin-ico"></span>${c.cost}`;
        return `<div class="${cls}" data-id="${c.id}"><div class="t">${c.title}</div><div class="d">${c.desc}</div><div class="c">${price}</div></div>`;
      })
      .join('');
  }

  popup(x: number, y: number, text: string, kind: 'gold' | 'bad' | 'info' = 'gold'): void {
    const el = document.createElement('div');
    el.className = `pop ${kind === 'gold' ? '' : kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /** A coin flies from a screen point to the coin pill; `onArrive` fires when it lands. */
  coinFly(x: number, y: number, delayMs: number, onArrive: () => void): void {
    const el = document.createElement('div');
    el.className = 'fly-coin coin-ico';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popups.appendChild(el);
    const target = this.coinsPill.getBoundingClientRect();
    const dx = target.left + 20 - x;
    const dy = target.top + target.height / 2 - y;
    setTimeout(() => {
      el.style.transform = `translate(${dx}px, ${dy}px) scale(0.8)`;
    }, 20 + delayMs);
    setTimeout(() => {
      el.remove();
      onArrive();
    }, 640 + delayMs);
  }

  showEnd(win: boolean, coins: number): void {
    $('endTitle').textContent = win ? 'SPACE EMPIRE BUILT!' : 'SHIPS LEFT UNSERVED';
    $('endSub').textContent = win ? 'Your mining network now runs itself.' : 'Keep crystals flowing to the dock.';
    $('endCoins').textContent = String(coins);
    $('endBtn').textContent = win ? 'PLAY AGAIN' : 'TRY AGAIN';
    this.endcard.classList.toggle('lose', !win);
    this.endcard.classList.remove('hidden');
    this.showTutorial(false);
    this.setHint(null);
    this.cards.innerHTML = '';
    this.cardsKey = '';
  }
}
