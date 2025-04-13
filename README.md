# Chessdle ♟️

A Wordle-inspired daily chess puzzle game using the Lichess Daily Puzzle API.

Made with ❤️ by me!

Inspired by a story from GM Daniel Naroditsky _(Danya)_, where his teacher had him only say the **final move** of the puzzle, forcing him to calculate the full line.

## How it Works

Chessdle presents you with the Lichess Puzzle of the Day. Your goal is to figure out the **entire sequence of moves** that solves the puzzle.

1.  **Daily Puzzle:** The app fetches the current Puzzle of the Day from Lichess when loaded.
2.  **Input Moves:** You interact with the chessboard by dragging and dropping pieces to input the _full sequence_ of moves required to solve the puzzle.
3.  **Submit Attempt:** Once you have entered the complete sequence for an attempt, click the "Submit Attempt" button.
4.  **Get Feedback:** The app compares your submitted sequence to the actual solution, move by move, and provides feedback for each move in your sequence:
    - 🟩 **Green:** Correct move! You moved the correct piece (from the correct starting square) to the correct destination square for that step in the sequence.
    - 🟨 **Yellow:** Partially correct! EITHER you moved the correct piece (from the correct starting square) but to the wrong destination, OR you moved a different piece but landed on the correct destination square for that step.
    - 🟥 **Red:** Incorrect. Neither the piece's starting square nor the destination square matches the correct solution move for that step.
5.  **Guessing:** You have a limited number of attempts (currently set to 5) to guess the entire sequence correctly.
6.  **Win/Loss:**
    - You win if all moves in your submitted sequence are Green!
    - You lose if you run out of attempts. The correct solution will be shown.

## Technology Stack

- **Frontend:** React
- **Styling:** styled-components
- **Chess Logic:** `chess.js` (for validating moves, handling FEN/PGN, managing board state)
- **Chessboard UI:** `react-chessboard` (for displaying the board and handling drag-and-drop)
- **Puzzle Data:** Lichess API (`https://lichess.org/api/puzzle/daily`) via a CORS proxy (`https://api.allorigins.win/raw?url=`)

## Setup and Running Locally

1.  **Prerequisites:** Ensure you have Node.js and npm (or yarn) installed.
2.  **Clone/Download:** Get the project code.
3.  **Navigate:** Open your terminal in the project directory.
4.  **Install Dependencies:** Run `npm install` or `yarn install`. Make sure you have `react`, `react-dom`, `chess.js`, `react-chessboard`, and `styled-components` installed.
5.  **Run:** Start the development server using the command `npm run dev`.
6.  **Open:** Access the application in your browser at the local address provided.

## License

This project is licensed under the MIT License.

---

**MIT License**

Copyright (c) [Year] [Your Name/GitHub Username]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
