"use strict";

function shuffled(array) {
  const shuffledArray = array.slice();

  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }

  return shuffledArray;
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
    const nextLowestRank = Card.RANKS[rankIndex - 1];
    return Deck.CARDS_BY_KEY.get(Card.makeKey(nextLowestRank, card.suit));
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
  constructor(stock, rows) {
    this.stock = stock || Deck.all();
    this.rows = rows || [[], [], [], []];
  }

  _clone() {
    // "clone" is enough to get react to re-render state on change and that's all we're after
    return new Game(this.stock, this.rows);
  }

  getRows() {
    return this.rows;
  }

  needsDeal() {
    return this.stock.length !== 0;
  }

  deal() {
    const self = this._clone();

    Deck.addAces();
    self.stock = shuffled(self.stock);

    let rowIndex = 0;
    for (const row of self.rows) {
      while (row.length < 13) {
        const card = self.stock.shift();
        card.row = rowIndex;
        card.column = row.length;
        row.push(card);
      }

      rowIndex++;
    }

    Deck.removeAces();

    return self;
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
      const blanksFirstColumn = blanks
        .filter((c) => c.column === 0)
        .sort((a, b) => a.row - b.row);

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
  let onClick = null;

  if (!card.isBlank()) {
    classes.push(card.color);
    onClick = () => moveCard(card);
  } else {
    classes.push("blank");
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

  const moveCard = (card) => {
    console.log(`Try to move ${card.key}`);
    setGame(game.move(card));
  };

  return (
    <div className="board">
      <div className="controls">
        <button onClick={() => setGame(game.deal())}>Deal</button>
        <button onClick={() => setGame(game.clearUnset())}>Clear unset</button>
      </div>

      <div className="rows">
        {game
          .getRows()
          .map((row) =>
            row.map((card) => <CardComponent card={card} key={card.key} moveCard={moveCard} />),
          )
          .flat()}
      </div>
    </div>
  );
}

ReactDOM.render(React.createElement(Board), document.querySelector("#container"));
