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
  static RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
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
    this.nextRank = this.prevRank = null;
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
    return this.suit === "B";
  }
}

class Deck {
  static CARDS = Array.from(Card.SUITS.keys())
    .map((suit) =>
      Card.RANKS.map((rank) => {
        return new Card(rank, suit);
      }),
    )
    .flat()
    .concat([
      // add blanks
      new Card("B1", "B"),
      new Card("B2", "B"),
      new Card("B3", "B"),
      new Card("B4", "B"),
    ]);

  static CARDS_BY_KEY = new Map(Deck.CARDS.map((card) => [card.key, card]));

  static _ = Deck.CARDS.forEach((card) => {
    const rankIndex = Card.RANKS.indexOf(card.rank);
    const prevRank = Card.RANKS[rankIndex - 1];
    const nextRank = Card.RANKS[rankIndex + 1];

    if (prevRank) {
      card.prevRank = Deck.CARDS_BY_KEY.get(Card.makeKey(prevRank, card.suit));
    }

    if (nextRank) {
      card.nextRank = Deck.CARDS_BY_KEY.get(Card.makeKey(nextRank, card.suit));
    }
  });

  static all() {
    return Deck.CARDS.slice();
  }

  static getCardsByRank(rank) {
    return Deck.CARDS.filter((card) => card.rank === rank);
  }

  static getBlanks() {
    return Deck.CARDS.filter((card) => card.isBlank());
  }
}

class Game {
  // TODO when i start using localstorage, will need to serialize to the card's KEY
  // and rehydrate after the cards have been recreated

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

  cardToLeft(card) {
    return this.rows[card.row][card.column - 1];
  }

  cardToRight(card) {
    return this.rows[card.row][card.column + 1];
  }

  clearUnfinished() {
    const self = this._clone();
    const finalizedCards = self.getFinalizedCards();

    for (const [rowIndex, row] of enumerate(self.rows)) {
      for (const [colIndex, card] of enumerate(row)) {
        if (!finalizedCards.has(card)) {
          extend(self.stock, row.slice(colIndex));
          self.rows[rowIndex] = row.slice(0, colIndex);
          break;
        }
      }
    }

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
          movable.add(cardToLeft.nextRank);
        }
      }
    }

    return movable;
  }

  getFinalizedCards() {
    const finalized = new Set();

    for (const row of this.rows) {
      if (row.length === 0) continue;

      let lastGoodCard = row[0];

      // if the first card isn't a 2, skip the whole row
      if (lastGoodCard.rank !== "2") {
        continue;
      }

      finalized.add(lastGoodCard);

      let next = lastGoodCard.nextRank;

      while (next && next === this.cardToRight(lastGoodCard)) {
        finalized.add(next);
        lastGoodCard = next;
        next = lastGoodCard.nextRank;
      }
    }

    return finalized;
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
      const nextLowest = card.prevRank;

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

function CardComponent({ card, moveCard, isFinalized }) {
  const classes = ["card"];

  if (isFinalized) {
    classes.push("finalized");
  }

  if (card.isBlank()) {
    classes.push("blank");
  } else {
    classes.push(card.color);
  }

  let onClick = null;
  if (moveCard) {
    onClick = () => moveCard(card);
    classes.push("movable");
  }

  return (
    <div className={classes.join(" ")} onClick={onClick}>
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
  const finalizedCards = game.getFinalizedCards();

  const moveCard = (card) => {
    console.log(`Move ${card.key}`);
    setGame(game.move(card));
  };

  return (
    <div className="board">
      <div className="controls">
        <button onClick={() => setGame(new Game().deal())}>New Game</button>
        <span>Deals: {game.meta.deals}</span> | <span>Available moves: {movableCards.size}</span>
        <button onClick={() => setGame(game.deal())} disabled={movableCards.size > 0}>
          Deal
        </button>
      </div>

      <div className="rows">
        {game.getRows().map((row) => {
          return (
            <div className="row">
              {row.map((card) => (
                <CardComponent
                  card={card}
                  key={card.key}
                  moveCard={movableCards.has(card) ? moveCard : null}
                  isFinalized={finalizedCards.has(card)}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="controls">
        <button onClick={() => setGame(game.clearUnfinished())}>Clear unset</button>
        <button onClick={() => setGame(game.move(shuffled(Array.from(movableCards))[0]))} disabled={movableCards.size === 0}>
          Random Move
        </button>
      </div>
    </div>
  );
}

ReactDOM.render(React.createElement(Board), document.querySelector("#container"));
