"use strict";

function shuffled(array) {
  const shuffledArray = array.slice();

  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }

  return shuffledArray;
}

function* enumerate(iterable, start = 0, step = 1) {
  let index = start;

  for (const a of iterable) {
    yield [index, a];
    index += step;
  }
}

function extend(arr1, arr2) {
  for (const a of arr2) {
    arr1.push(a);
  }
}

class Card {
  static RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  static SUITS = new Map([
    ["C", { symbol: "\u2663", color: "black" }],
    ["D", { symbol: "\u2666", color: "red" }],
    ["H", { symbol: "\u2665", color: "red" }],
    ["S", { symbol: "\u2660", color: "black" }],
  ]);

  static makeKey(rank, suit) {
    return `${rank}${suit}`;
  }

  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.row = this.column = null;
  }

  get symbol() {
    if (this.isBlank()) return null;
    return Card.SUITS.get(this.suit)?.symbol;
  }

  get color() {
    if (this.isBlank()) return null;
    return Card.SUITS.get(this.suit)?.color;
  }

  get key() {
    return Card.makeKey(this.rank, this.suit);
  }

  isBlank() {
    return this.rank === "B";
  }

  makeBlank() {
    if (this.isBlank()) return;
    if (this.rank !== "A") {
      throw new Error(`Only aces can be made blank: ${this.key}`);
    }
    this.rank = "B";
  }

  makeAce() {
    if (!this.isBlank()) return;
    this.rank = "A";
  }
}

class Deck {
  static CARDS = Array.from(Card.SUITS.keys())
    .map((suit) =>
      Card.RANKS.map((rank) => {
        return new Card(rank, suit);
      }),
    )
    .flat();

  static CARDS_BY_KEY = new Map(Deck.CARDS.map((card) => [card.key, card]));

  static all() {
    return Deck.CARDS.slice();
  }

  static nextLowestSuitedCard(card) {
    const rankIndex = Card.RANKS.indexOf(card.rank);
    const nextRank = Card.RANKS[rankIndex - 1];
    return Deck.CARDS_BY_KEY.get(Card.makeKey(nextRank, card.suit));
  }

  static nextHighestSuitedCard(card) {
    const rankIndex = Card.RANKS.indexOf(card.rank);
    const nextRank = Card.RANKS[rankIndex + 1];
    return Deck.CARDS_BY_KEY.get(Card.makeKey(nextRank, card.suit));
  }

  static getCardsByRank(rank) {
    return Deck.CARDS.filter((card) => card.rank === rank);
  }

  static getBlanks() {
    return Deck.CARDS.filter((card) => card.isBlank());
  }

  static removeAces() {
    for (const ace of Deck.getCardsByRank("A")) ace.makeBlank();
  }

  static addAces() {
    for (const blank of Deck.getBlanks()) blank.makeAce();
  }
}

class Game {
  constructor(stock, rows, meta) {
    this.stock = stock || Deck.all();
    this.rows = rows || [[], [], [], []];
    this.meta = meta || { deals: 0 };
  }

  _clone() {
    // "clone" is enough to get react to re-render state on change and that's all we're after
    return new Game(this.stock, this.rows, this.meta);
  }

  getRows() {
    return this.rows;
  }

  needsDeal() {
    return this.stock.length !== 0;
  }

  cardToLeft(card) {
    return this.rows[card.row][card.column - 1];
  }

  cardToRight(card) {
    return this.rows[card.row][card.column + 1];
  }

  clearUnfinished() {
    const self = this._clone();

    for (const [rowIndex, row] of enumerate(self.rows)) {
      if (row.length === 0) continue;
      let lastGoodCard = row[0];

      // if the first card isn't a 2, add everything to the stock, kill the row, and move on
      if (lastGoodCard.rank !== "2") {
        extend(self.stock, row);
        self.rows[rowIndex] = [];
        continue;
      }

      while (self.cardToRight(lastGoodCard) === Deck.nextHighestSuitedCard(lastGoodCard)) {
        lastGoodCard = Deck.nextHighestSuitedCard(lastGoodCard);
      }

      extend(self.stock, row.slice(lastGoodCard.column + 1));
      self.rows[rowIndex] = row.slice(0, lastGoodCard.column + 1);
    }

    Deck.addAces();
    for (const card of self.stock) {
      card.row = card.column = null;
    }

    return self;
  }

  deal() {
    if (this.getMovableCards().size > 0) return this;

    const self = this.clearUnfinished();
    self.stock = shuffled(self.stock);

    for (const [rowIndex, row] of enumerate(self.rows)) {
      while (row.length < 13) {
        const card = self.stock.shift();
        card.row = rowIndex;
        card.column = row.length;
        row.push(card);
      }
    }

    Deck.removeAces();
    self.meta.deals++;

    return self;
  }

  getMovableCards() {
    const blanks = Deck.getBlanks();

    const movable = new Set();

    for (const blank of blanks) {
      if ([blank.row, blank.column].includes(null)) continue;

      if (blank.column === 0) {
        for (const two of Deck.getCardsByRank("2")) movable.add(two);
      } else {
        const cardToLeft = this.cardToLeft(blank);
        if (cardToLeft && !cardToLeft.isBlank() && cardToLeft.rank !== "K") {
          movable.add(Deck.nextHighestSuitedCard(cardToLeft));
        }
      }
    }

    return movable;
  }

  _swap(card, dest) {
    // first update the position on the cards
    [card.row, dest.row] = [dest.row, card.row];
    [card.column, dest.column] = [dest.column, card.column];

    // then move the cards in the rows
    this.rows[card.row][card.column] = card;
    this.rows[dest.row][dest.column] = dest;
  }

  move(card) {
    // there's an optimization here to avoid re-renders if it gets slow.
    // we're always cloning and returning a new clone even if we decide
    // the move isn't valid. a refactor would be needed to avoid the
    // clone
    const self = this._clone();

    const blanks = Deck.getBlanks();

    if (card.rank === "2") {
      // find all the blanks in the first column and sort by row
      const blanksFirstColumn = blanks.filter((c) => c.column === 0).sort((a, b) => a.row - b.row);

      if (blanksFirstColumn.length > 0) {
        if (card.column !== 0) {
          // the 2 isn't already in the first column so just put it
          // in the highest available row (lowest row number) in the 0th column
          self._swap(card, blanksFirstColumn[0]);
        } else {
          // in this case we want to move the 2 down to the next blank
          // in the first column (wrapping back to the first row if necessary)
          const blanksAfterCurrent = blanksFirstColumn.filter((c) => c.row > card.row);
          if (blanksAfterCurrent.length > 0) {
            self._swap(card, blanksAfterCurrent[0]);
          } else {
            self._swap(card, blanksFirstColumn[0]);
          }
        }
      }
    } else {
      const nextLowest = Deck.nextLowestSuitedCard(card);

      // make sure we're not at the far right of the board
      if (nextLowest.column < self.rows[nextLowest.row].length - 1) {
        const dest = self.rows[nextLowest.row][nextLowest.column + 1];

        // we can only swap if the destination card is blank
        if (dest.isBlank()) {
          self._swap(card, dest);
        }
      }
    }

    return self;
  }

  toString() {
    return this.rows
      .map((row) => row.map((card) => (card.isBlank() ? "  " : card.key)).join(" "))
      .join("\n");
  }
}

function CardComponent({ card, moveCard }) {
  const classes = ["card"];

  if (!card.isBlank()) {
    classes.push(card.color);
  } else {
    classes.push("blank");
  }

  let onClick = null;
  if (moveCard) {
    onClick = () => moveCard(card);
    classes.push("movable");
  }

  return (
    <div
      className={classes.join(" ")}
      style={{ gridColumn: card.column + 1, gridRow: card.row + 1 }}
      onClick={onClick}
    >
      <div className="card-corner">
        <div className="card-rank">{card.rank}</div>
        <div>{card.symbol}</div>
      </div>
    </div>
  );
}

function Board() {
  const [game, setGame] = React.useState(new Game());
  const movableCards = game.getMovableCards();

  const moveCard = (card) => {
    console.log(`Try to move ${card.key}`);
    setGame(game.move(card));
  };

  return (
    <div className="board">
      <div className="controls">
        <button onClick={() => setGame(new Game().deal())}>New Game</button>|||||||||
        <button onClick={() => setGame(game.deal())} disabled={movableCards.size > 0}>
          Deal
        </button>
        <button onClick={() => setGame(game.clearUnfinished())}>Clear unset</button>
        <span>Deals: {game.meta.deals}</span> | <span>Possible moves: {movableCards.size}</span>
      </div>

      <div className="rows">
        {game
          .getRows()
          .map((row) =>
            row.map((card) => (
              <CardComponent
                card={card}
                key={card.key}
                moveCard={movableCards.has(card) ? moveCard : null}
              />
            )),
          )
          .flat()}
      </div>
    </div>
  );
}

ReactDOM.render(React.createElement(Board), document.querySelector("#container"));
