import React, { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styled, { createGlobalStyle } from "styled-components";
import { motion, AnimatePresence } from "motion/react";

// --- Constants ---
const LICHESS_DAILY_PUZZLE_URL = "https://lichess.org/api/puzzle/daily";
const MAX_ATTEMPTS = 5;
const CORS_PROXY_URL = "https://api.allorigins.win/raw?url="; // CORS Proxy

// --- Helper Functions ---

/**
 * Parses Standard Algebraic Notation (SAN) using chess.js.
 * Requires the FEN string of the board *before* the move for context.
 */
const parseSanMove = (fenBeforeMove, san) => {
  if (typeof Chess === "undefined") {
    console.error("Chess.js library is not loaded.");
    return null;
  }
  const tempGame = new Chess(fenBeforeMove);
  try {
    const moveDetails = tempGame.move(san);
    if (!moveDetails) return null;
    return {
      piece: moveDetails.piece,
      from: moveDetails.from,
      to: moveDetails.to,
      san: moveDetails.san,
      color: moveDetails.color,
      promotion: moveDetails.promotion,
    };
  } catch (e) {
    console.warn(
      `Could not parse SAN move "${san}" from FEN "${fenBeforeMove}":`,
      e.message
    );
    return null;
  }
};

/**
 * Parses Universal Chess Interface (UCI) notation string.
 */
const parseUci = (uci) => {
  if (!uci || uci.length < 4 || uci.length > 5) return null;
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promotion =
    uci.length === 5 ? uci.substring(4, 5).toLowerCase() : undefined;
  const validSquare = /^[a-h][1-8]$/;
  if (!validSquare.test(from) || !validSquare.test(to)) return null;
  if (promotion && !/^[qrbn]$/.test(promotion)) return null;
  return { from, to, promotion };
};

// --- Animation Variants (Framer Motion) ---
const listVariants = {
  visible: {
    opacity: 1,
    transition: { when: "beforeChildren", staggerChildren: 0.05 },
  },
  hidden: { opacity: 0 },
};
const itemVariants = {
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
  hidden: { opacity: 0, y: 10 },
};
const messageVariants = {
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  hidden: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

// --- Components ---

/**
 * Renders the animated feedback UI (colored squares) for a single attempt's move sequence.
 */
function AnimatedFeedbackDisplay({ userSequence, feedback }) {
  if (
    !Array.isArray(feedback) ||
    !Array.isArray(userSequence) ||
    userSequence.length !== feedback.length ||
    feedback.length === 0
  ) {
    return (
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--feedback-red, #ef4444)",
          padding: "0.25rem",
        }}
      >
        Invalid feedback data provided.
      </div>
    );
  }

  return (
    <FeedbackList variants={listVariants} initial="hidden" animate="visible">
      {userSequence.map((move, index) => (
        <FeedbackListItem
          key={`${index}-${move}`}
          $feedbackType={feedback[index]}
          variants={itemVariants}
          layout
        >
          {userSequence.length > 1 ? `${index + 1}. ` : ""}
          {move || "?"}
        </FeedbackListItem>
      ))}
    </FeedbackList>
  );
}

/**
 * Main application component for the Chessdle game.
 * Handles fetching puzzles, game state, user input, validation, and rendering.
 */
function App() {
  // --- State Variables ---
  const [puzzle, setPuzzle] = useState(null); // Current puzzle data
  const [game, setGame] = useState(null); // chess.js instance for setup/validation
  const [currentFen, setCurrentFen] = useState("start"); // FEN for the displayed board
  const [userMoveSequence, setUserMoveSequence] = useState([]); // User's moves for the current attempt (SAN)
  const [attemptsHistory, setAttemptsHistory] = useState([]); // History of past attempts [{ sequence, feedback }]
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(1); // Current attempt count
  const [gameState, setGameState] = useState("loading"); // 'loading', 'playing', 'won', 'lost', 'error'
  const [errorMessage, setErrorMessage] = useState(""); // Error messages

  // --- Effects ---

  // Fetch and process the daily puzzle on component mount
  useEffect(() => {
    const fetchDailyPuzzle = async () => {
      setGameState("loading");
      // Reset state for new puzzle
      setErrorMessage("");
      setAttemptsHistory([]);
      setCurrentAttemptNumber(1);
      setUserMoveSequence([]);
      setCurrentFen("start");
      setGame(null);
      setPuzzle(null);

      const targetUrl = CORS_PROXY_URL
        ? CORS_PROXY_URL + encodeURIComponent(LICHESS_DAILY_PUZZLE_URL)
        : LICHESS_DAILY_PUZZLE_URL;

      console.log("Fetching daily puzzle from:", targetUrl);

      try {
        const response = await fetch(targetUrl);
        if (!response.ok) {
          throw new Error(
            `HTTP error! Status: ${response.status} - ${
              response.statusText || "Failed to fetch"
            }`
          );
        }
        const data = await response.json();
        console.log("Raw puzzle data received:", data);

        // --- Data Extraction & Validation ---
        let baseFen = data?.game?.fen;
        const pgn = data?.game?.pgn;
        const initialPly = data?.puzzle?.initialPly;
        const solution = data?.puzzle?.solution;

        if (!solution || !Array.isArray(solution) || solution.length === 0) {
          throw new Error(
            "Incomplete puzzle data: Solution is missing or empty."
          );
        }
        if (
          !baseFen &&
          (!pgn || initialPly === undefined || initialPly === null)
        ) {
          throw new Error(
            "Incomplete puzzle data: Cannot determine starting FEN."
          );
        }

        // --- Derive Base FEN from PGN if necessary ---
        if (!baseFen) {
          console.log("Attempting to derive FEN from PGN at ply:", initialPly);
          try {
            if (typeof Chess === "undefined")
              throw new Error("Chess.js not loaded for PGN parsing.");
            const tempChess = new Chess();
            tempChess.loadPgn(pgn, { sloppy: true });
            const history = tempChess.history();
            tempChess.reset();
            for (let i = 0; i < initialPly; i++) {
              if (!history[i])
                throw new Error(`PGN history missing move at ply ${i}.`);
              tempChess.move(history[i]);
            }
            const opponentMoveIndex = initialPly;
            if (history[opponentMoveIndex]) {
              tempChess.move(history[opponentMoveIndex]);
            }
            baseFen = tempChess.fen();
            console.log("Derived FEN from PGN:", baseFen);
          } catch (pgnError) {
            throw new Error(
              `Failed to derive FEN from PGN: ${pgnError.message}`
            );
          }
        }

        // --- Validate Base FEN ---
        try {
          if (typeof Chess === "undefined")
            throw new Error("Chess.js not loaded for FEN validation.");
          new Chess(baseFen);
        } catch (fenValidationError) {
          throw new Error(
            `Initial FEN ("${baseFen}") is invalid: ${fenValidationError.message}`
          );
        }

        // --- Correct FEN Turn Marker if Necessary ---
        // Checks if the first solution move is valid from the current FEN turn. Flips if not.
        let correctedFen = baseFen;
        const firstSolutionMoveUci = solution[0];
        const parsedFirstMove = parseUci(firstSolutionMoveUci);
        if (!parsedFirstMove) {
          throw new Error(
            `Invalid first solution move format received: ${firstSolutionMoveUci}`
          );
        }

        let turnSeemsCorrect = false;
        try {
          if (typeof Chess === "undefined")
            throw new Error("Chess.js not loaded for turn check.");
          if (new Chess(baseFen).move(parsedFirstMove) !== null) {
            turnSeemsCorrect = true;
          }
        } catch (turnCheckError) {
          console.warn(
            "Initial turn check failed, likely need to flip turn marker:",
            turnCheckError.message
          );
        }

        if (!turnSeemsCorrect) {
          console.log("Attempting to correct FEN turn marker...");
          const fenParts = baseFen.split(" ");
          if (fenParts.length >= 2) {
            const currentTurn = fenParts[1];
            const newTurn = currentTurn === "w" ? "b" : "w";
            fenParts[1] = newTurn;
            const flippedFen = fenParts.join(" ");
            try {
              if (typeof Chess === "undefined")
                throw new Error("Chess.js not loaded for flipped turn check.");
              if (new Chess(flippedFen).move(parsedFirstMove) !== null) {
                correctedFen = flippedFen;
                console.log(
                  "FEN turn successfully corrected to:",
                  correctedFen
                );
              } else {
                console.error(
                  "Flipping FEN turn did not make the first solution move valid. Using original FEN:",
                  baseFen
                );
                correctedFen = baseFen;
              }
            } catch (flipCheckError) {
              console.error(
                "Error checking move with flipped FEN. Using original FEN:",
                flipCheckError.message
              );
              correctedFen = baseFen;
            }
          } else {
            console.error(
              "Could not parse FEN string to flip turn marker. Using original FEN:",
              baseFen
            );
            correctedFen = baseFen;
          }
        }

        // --- Final Validation and State Update ---
        let finalInitialFen = correctedFen;
        let chessInstance;
        try {
          if (typeof Chess === "undefined")
            throw new Error("Chess.js not loaded for final instance creation.");
          chessInstance = new Chess(finalInitialFen);
        } catch (fenError) {
          throw new Error(
            `Invalid final FEN ("${finalInitialFen}") after processing: ${fenError.message}`
          );
        }

        // --- Set Game State ---
        const playerColor =
          finalInitialFen.split(" ")[1] === "w" ? "white" : "black";
        setPuzzle({
          id:
            data.puzzle?.id ||
            `lichess_daily_${new Date().toISOString().split("T")[0]}`,
          rating: data.puzzle?.rating || "N/A",
          initialFen: finalInitialFen,
          solution: solution,
          playerColor: playerColor,
        });
        setGame(chessInstance);
        setCurrentFen(finalInitialFen);
        setGameState("playing");
        console.log("Puzzle loaded successfully:", {
          id: puzzle?.id,
          rating: puzzle?.rating,
          fen: finalInitialFen,
          turn: playerColor,
        });
      } catch (err) {
        console.error("Failed to fetch or process puzzle:", err);
        setErrorMessage(
          `Failed to load daily puzzle: ${
            err.message || "An unknown error occurred"
          }. Please try refreshing.`
        );
        setGameState("error");
      }
    };

    fetchDailyPuzzle();
  }, []); // Run only on mount

  // --- Callbacks ---

  /**
   * Handles piece drop events from react-chessboard.
   * Validates the move and updates state if legal.
   */
  const onDrop = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (gameState !== "playing" || !puzzle || !currentFen) return false;

      if (typeof Chess === "undefined") {
        console.error("Chess.js not loaded in onDrop callback.");
        return false;
      }
      const gameCopy = new Chess(currentFen);
      let moveResult = null;

      try {
        // Attempt move, auto-promoting to queen
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (error) {
        console.error("Error attempting move in chess.js:", error);
        return false;
      }

      if (moveResult === null) {
        console.log(`Illegal move attempted: ${sourceSquare}-${targetSquare}`);
        return false; // Indicate illegal move
      }

      // Update state on valid move
      console.log(`Valid move made: ${moveResult.san}`);
      setCurrentFen(gameCopy.fen());
      setUserMoveSequence((prev) => [...prev, moveResult.san]);
      return true; // Signal success to react-chessboard
    },
    [currentFen, gameState, puzzle]
  );

  /**
   * Resets the current attempt's input sequence and board display.
   */
  const handleResetInput = () => {
    if (!puzzle || gameState !== "playing") return;
    console.log("Resetting current input sequence and board.");
    setCurrentFen(puzzle.initialFen);
    setUserMoveSequence([]);
  };

  /**
   * Submits the current user sequence for validation against the solution.
   * Updates attempts history and game state (won/lost/playing).
   */
  const handleSubmit = () => {
    if (
      !puzzle ||
      !puzzle.solution ||
      !puzzle.initialFen ||
      userMoveSequence.length === 0 ||
      gameState !== "playing"
    ) {
      console.warn(
        "Submit attempt prevented: Invalid state or empty sequence."
      );
      return;
    }

    console.log(
      `Submitting attempt ${currentAttemptNumber}:`,
      userMoveSequence
    );

    const solutionMovesUci = puzzle.solution;
    const feedbackResults = [];
    let allCorrect = true;
    let validationGame; // Use a separate instance for validation

    // --- Initialize Validation ---
    try {
      if (typeof Chess === "undefined")
        throw new Error("Chess.js not loaded for validation.");
      validationGame = new Chess(puzzle.initialFen);
    } catch (err) {
      console.error("Validation instance creation error:", err);
      setErrorMessage(
        "Internal error during validation setup. Please refresh."
      );
      setGameState("error");
      return;
    }

    const comparisonLength = Math.max(
      userMoveSequence.length,
      solutionMovesUci.length
    );

    // --- Compare User Moves to Solution Step-by-Step ---
    for (let i = 0; i < comparisonLength; i++) {
      const currentValidationFen = validationGame.fen();
      const userSan = userMoveSequence[i];
      const solutionUci = solutionMovesUci[i];
      let result = "red"; // Default feedback

      const userMoveObject = userSan
        ? parseSanMove(currentValidationFen, userSan)
        : null;
      const solutionMoveObject = solutionUci ? parseUci(solutionUci) : null;

      // --- Calculate Feedback (Green/Yellow/Red) ---
      // Compares parsed user move (if valid) to the parsed solution move.
      // Provides 'yellow' for partial matches (correct 'from' or 'to').
      if (userMoveObject && solutionMoveObject) {
        const isExactMatch =
          userMoveObject.from === solutionMoveObject.from &&
          userMoveObject.to === solutionMoveObject.to &&
          (userMoveObject.promotion || null) ===
            (solutionMoveObject.promotion || null);

        if (isExactMatch) {
          result = "green";
        } else {
          const fromMatch = userMoveObject.from === solutionMoveObject.from;
          const toMatch = userMoveObject.to === solutionMoveObject.to;
          if (fromMatch !== toMatch) {
            // XOR
            result = "yellow";
          }
        }
      } else if (!userMoveObject && userSan && solutionMoveObject) {
        // Heuristic: Give yellow if user's *intended* destination (even if move was illegal) matches solution.
        const sanDestMatch = userSan.match(/([a-h][1-8])=?([qrbn])?[+#]?$/i);
        const userIntendedDest = sanDestMatch ? sanDestMatch[1] : null;
        if (userIntendedDest && userIntendedDest === solutionMoveObject.to) {
          result = "yellow";
        }
      }

      feedbackResults.push(result);
      if (result !== "green") {
        allCorrect = false;
      }

      // --- Advance Internal Validation Board State using the CORRECT solution move ---
      if (solutionUci && solutionMoveObject) {
        try {
          if (!validationGame.move(solutionMoveObject)) {
            console.error(
              `CRITICAL: Solution move ${i} (${solutionUci}) illegal from FEN "${currentValidationFen}".`
            );
            feedbackResults[feedbackResults.length - 1] = "red";
            allCorrect = false;
            break; // Stop validation if solution path breaks
          }
        } catch (e) {
          console.error(
            `Error applying solution move ${i} (${solutionUci}) during validation: ${e.message}.`
          );
          feedbackResults[feedbackResults.length - 1] = "red";
          allCorrect = false;
          break;
        }
      } else if (i < solutionMovesUci.length) {
        // Handle invalid solution UCI format
        console.error(
          `CRITICAL: Solution UCI at index ${i} ("${
            solutionUci || "undefined"
          }") is invalid.`
        );
        setErrorMessage("Internal error: Invalid solution data received.");
        setGameState("error");
        return;
      }
    } // --- End validation loop ---

    // Mark any extra user moves as red
    while (feedbackResults.length < userMoveSequence.length) {
      feedbackResults.push("red");
      allCorrect = false;
    }

    // --- Update Game State ---
    const newAttempt = {
      sequence: userMoveSequence,
      feedback: feedbackResults,
    };
    setAttemptsHistory((prev) => [...prev, newAttempt]);

    if (allCorrect && userMoveSequence.length === solutionMovesUci.length) {
      setGameState("won");
      console.log("Game Won!");
    } else if (currentAttemptNumber >= MAX_ATTEMPTS) {
      setGameState("lost");
      console.log("Game Lost - Max attempts reached.");
    } else {
      // Continue playing
      setGameState("playing");
      setCurrentAttemptNumber((prev) => prev + 1);
      setUserMoveSequence([]);
      if (puzzle) setCurrentFen(puzzle.initialFen); // Reset board display
      console.log(
        `Attempt ${currentAttemptNumber} submitted. Proceeding to attempt ${
          currentAttemptNumber + 1
        }.`
      );
    }
  }; // --- End handleSubmit ---

  // --- Render Logic ---
  const isGameOver = gameState === "won" || gameState === "lost";

  if (gameState === "loading") {
    return (
      <AppWrapper>
        <Container>Loading Daily Puzzle...</Container>
      </AppWrapper>
    );
  }

  if (gameState === "error") {
    return (
      <AppWrapper>
        <Container>
          <InfoText
            style={{
              color: "var(--feedback-red, #ef4444)",
              fontWeight: "bold",
            }}
          >
            Error:
          </InfoText>
          <InfoText style={{ color: "var(--text-secondary, #a0a0a0)" }}>
            {errorMessage}
          </InfoText>
        </Container>
      </AppWrapper>
    );
  }

  if (!puzzle) {
    return (
      <AppWrapper>
        <Container>Waiting for puzzle data...</Container>
      </AppWrapper>
    );
  }

  // --- Main Game Render ---
  return (
    <>
      <GlobalStyle />
      <AppWrapper>
        <Container>
          <Title>Chessdle</Title>
          <InfoText>Rating: {puzzle.rating}</InfoText>
          {!isGameOver && (
            <InfoText marginBottom="1rem">
              Attempt {currentAttemptNumber} of {MAX_ATTEMPTS}. Find the{" "}
              {puzzle.solution.length}-move solution. Turn:{" "}
              <TurnText>{puzzle.playerColor}</TurnText>
            </InfoText>
          )}

          {/* Attempts History */}
          <HistoryContainer>
            <AnimatePresence initial={false}>
              {attemptsHistory.map((attempt, index) => (
                <AttemptHistoryItem
                  key={index}
                  $isLastAttempt={index === attemptsHistory.length - 1}
                  $isGameOver={isGameOver}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <AttemptLabel>Attempt {index + 1}:</AttemptLabel>
                  <AnimatedFeedbackDisplay
                    userSequence={attempt.sequence}
                    feedback={attempt.feedback}
                  />
                </AttemptHistoryItem>
              ))}
            </AnimatePresence>
          </HistoryContainer>

          {/* Board & Controls (only shown while playing) */}
          {gameState === "playing" && (
            <>
              <BoardWrapper>
                <Chessboard
                  key={`${puzzle.id}-${currentAttemptNumber}`}
                  id="ChessdleBoard"
                  position={currentFen}
                  onPieceDrop={onDrop}
                  boardOrientation={puzzle.playerColor}
                  arePiecesDraggable={gameState === "playing"}
                  customBoardStyle={{
                    borderRadius: "4px",
                    boxShadow:
                      "0 4px 15px var(--shadow-color-rgba, rgba(0, 0, 0, 0.2))",
                  }}
                  customDarkSquareStyle={{
                    backgroundColor: "var(--board-dark, #6b8f4b)",
                  }}
                  customLightSquareStyle={{
                    backgroundColor: "var(--board-light, #c2d1b0)",
                  }}
                />
              </BoardWrapper>

              {/* Current Input Sequence */}
              <CurrentSequenceDisplay>
                <CurrentSequenceLabel>
                  Current sequence ({userMoveSequence.length}/
                  {puzzle.solution.length} moves):
                </CurrentSequenceLabel>
                <CurrentSequenceMoves>
                  {userMoveSequence.join(" ") || "(Drag pieces to make moves)"}
                </CurrentSequenceMoves>
              </CurrentSequenceDisplay>

              {/* Action Buttons */}
              <ControlsWrapper>
                <StyledButton
                  onClick={handleResetInput}
                  disabled={
                    userMoveSequence.length === 0 || gameState !== "playing"
                  }
                >
                  Reset Input
                </StyledButton>
                <StyledButton
                  primary
                  onClick={handleSubmit}
                  disabled={
                    userMoveSequence.length === 0 || gameState !== "playing"
                  }
                >
                  Submit Attempt {currentAttemptNumber}
                </StyledButton>
              </ControlsWrapper>
            </>
          )}

          {/* Win/Loss Messages */}
          <AnimatePresence>
            {gameState === "won" && (
              <Message
                key="win-message"
                type="won"
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                Correct! You solved it in {attemptsHistory.length} attempt
                {attemptsHistory.length > 1 ? "s" : ""}! 🎉
              </Message>
            )}
            {gameState === "lost" && (
              <Message
                key="lost-message"
                type="lost"
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                Game Over! Max attempts ({MAX_ATTEMPTS}) reached.
                <SolutionText>
                  Correct Solution: {puzzle.solution.join(" ")}
                </SolutionText>
              </Message>
            )}
          </AnimatePresence>
        </Container>
      </AppWrapper>
    </>
  );
}

// --- Global Styles ---
const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=National+Park:wght@200..800&display=swap');

  /* CSS Variables for Theming */
  :root {
    /* Raw Color Palettes */
    --dark-green-100: #e0f2f1;
    --dark-green-200: #b2dfdb;
    --dark-green-300: #80cbc4;
    --dark-green-400: #4db6ac; /* Primary Accent */
    --dark-green-500: #26a69a; /* Feedback Green / Button Hover */
    --dark-green-600: #00897b; /* Board Dark */
    --dark-green-700: #00796b; /* Border / Tertiary Bg */
    --dark-green-800: #00695c; /* Secondary Bg / Message Bg */
    --dark-green-900: #00251f; /* Primary Bg */

    --orange-100: #fff3e0;
    --orange-200: #ffe0b2;
    --orange-300: #ffcc80;
    --orange-400: #ffb74d;
    --orange-500: #ffa726; /* Secondary Accent / Feedback Yellow */
    --orange-600: #fb8c00; /* Button Hover */
    --orange-700: #f57c00;
    --orange-800: #ef6c00;
    --orange-900: #e65100;

    --neutral-100: #eceff1; /* Primary Text / Button Text */
    --neutral-200: #cfd8dc;
    --neutral-300: #b0bec5; /* Secondary Text */
    --neutral-400: #90a4ae;
    --neutral-500: #78909c;
    --neutral-600: #607d8b;
    --neutral-700: #546e7a;
    --neutral-800: #455a64;
    --neutral-900: #37474f;

    /* Semantic Mapping */
    --background-primary: var(--dark-green-900);
    --background-secondary: var(--dark-green-800);
    --background-tertiary: var(--dark-green-700);
    --text-primary: var(--neutral-100);
    --text-secondary: var(--neutral-300);
    --border-color: var(--dark-green-700);
    --accent-primary: var(--dark-green-400);
    --accent-secondary: var(--orange-500);
    --shadow-color-rgba: rgba(0, 20, 15, 0.5);

    --feedback-green: var(--dark-green-500);
    --feedback-yellow: var(--orange-500);
    --feedback-red: #ef4444; 
    --feedback-yellow-text: var(--neutral-900);

    --board-light: var(--dark-green-300);
    --board-dark: var(--dark-green-600);

    --button-primary-bg: var(--accent-primary);
    --button-primary-hover-bg: var(--dark-green-500);
    --button-secondary-bg: var(--accent-secondary);
    --button-secondary-hover-bg: var(--orange-600);
    --button-text: var(--neutral-100); 
    --button-disabled-opacity: 0.6;

    --message-won-bg: var(--dark-green-800);
    --message-won-text: var(--dark-green-200);
    --message-won-border: var(--dark-green-500);
    --message-lost-bg: #5f2120; 
    --message-lost-text: #fecaca; 
    --message-lost-border: var(--feedback-red);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'National Park', serif;
    background-color: var(--background-primary); 
    color: var(--text-primary);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .react-chessboard svg { max-width: 100%; height: auto; display: block; }
`;

// --- Styled Components ---

const AppWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Container = styled.div`
  padding: 2rem;
  max-width: 40rem;
  width: 100%;
`;

const Title = styled.h1`
  font-size: 2rem;
  line-height: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
`;

const InfoText = styled.p`
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: ${(props) => props.marginBottom || "0.5rem"};
  line-height: 1.4;
`;

const TurnText = styled.span`
  font-weight: 600;
  text-transform: capitalize;
  color: var(--text-primary);
`;

const HistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.75rem;
  background-color: var(--background-primary);
  max-height: 200px;
  overflow-y: auto;
`;

const AttemptHistoryItem = styled(motion.div)`
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
  background-color: var(--background-secondary);
  ${({ $isLastAttempt, $isGameOver }) =>
    $isLastAttempt &&
    $isGameOver &&
    `
      border-width: 2px;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 2px var(--accent-primary-rgba, rgba(52, 211, 153, 0.3));
    `}
`;

const AttemptLabel = styled.p`
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.375rem;
  color: var(--text-secondary);
`;

const FeedbackList = styled(motion.ul)`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  list-style: none;
  padding: 0;
  margin: 0;
`;

const FeedbackListItem = styled(motion.li)`
  padding: 0.25rem 0.6rem;
  border-radius: 0.375rem;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 0.8rem;
  font-weight: 500;
  background-color: ${(props) => {
    switch (props.$feedbackType) {
      case "green":
        return "var(--feedback-green)";
      case "yellow":
        return "var(--feedback-yellow)";
      case "red":
        return "var(--feedback-red)";
      default:
        return "var(--border-color)";
    }
  }};
  color: ${(props) =>
    props.$feedbackType === "yellow"
      ? "var(--feedback-yellow-text)"
      : "var(--button-text, white)"};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  line-height: 1.2;
  text-align: center;
`;

const BoardWrapper = styled.div`
  max-width: 30rem;
  margin: 0 auto 1.5rem auto;
  box-shadow: 0 6px 20px var(--shadow-color-rgba, rgba(0, 0, 0, 0.3));
  border-radius: 0.375rem;
  overflow: hidden;
  border: 1px solid var(--border-color);
`;

const CurrentSequenceDisplay = styled.div`
  text-align: center;
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background-color: var(--background-primary);
  border-radius: 0.375rem;
  border: 1px solid var(--border-color);
`;

const CurrentSequenceLabel = styled.p`
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 0.375rem 0;
`;

const CurrentSequenceMoves = styled.p`
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 0.85rem;
  word-break: break-all;
  color: var(--text-primary);
  min-height: 1.5rem;
  line-height: 1.5;
  margin: 0;
  background-color: var(--background-secondary);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid var(--border-color);
`;

const ControlsWrapper = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StyledButton = styled.button`
  padding: 0.6rem 1.2rem;
  color: var(--button-text);
  border-radius: 0.375rem;
  box-shadow: 0 1px 3px 0 var(--shadow-color-rgba, rgba(0, 0, 0, 0.2)),
    0 1px 2px 0 var(--shadow-color-rgba, rgba(0, 0, 0, 0.2));
  transition: background-color 150ms ease-in-out, opacity 150ms ease-in-out,
    box-shadow 150ms ease-in-out;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  background-color: ${(props) =>
    props.primary ? "var(--button-primary-bg)" : "var(--button-secondary-bg)"};

  &:hover:not(:disabled) {
    background-color: ${(props) =>
      props.primary
        ? "var(--button-primary-hover-bg)"
        : "var(--button-secondary-hover-bg)"};
  }
  &:focus-visible {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px
      ${(props) =>
        props.primary
          ? "var(--accent-primary)"
          : "var(--accent-secondary)"}99; /* Add alpha */
  }
  &:disabled {
    opacity: var(--button-disabled-opacity);
    cursor: not-allowed;
    &:hover {
      background-color: ${(props) =>
        props.primary
          ? "var(--button-primary-bg)"
          : "var(--button-secondary-bg)"};
    }
  }
`;

const Message = styled(motion.div)`
  margin-top: 1rem;
  padding: 1rem;
  text-align: center;
  border-radius: 0.5rem;
  border-width: 1px;
  border-style: solid;
  box-shadow: 0 1px 3px 0 var(--shadow-color-rgba, rgba(0, 0, 0, 0.2)),
    0 1px 2px 0 var(--shadow-color-rgba, rgba(0, 0, 0, 0.2));
  font-size: 1rem;
  font-weight: 500;
  background-color: ${(props) =>
    props.type === "won" ? "var(--message-won-bg)" : "var(--message-lost-bg)"};
  color: ${(props) =>
    props.type === "won"
      ? "var(--message-won-text)"
      : "var(--message-lost-text)"};
  border-color: ${(props) =>
    props.type === "won"
      ? "var(--message-won-border)"
      : "var(--message-lost-border)"};
`;

const SolutionText = styled.p`
  font-size: 0.8rem;
  margin-top: 0.5rem;
  font-weight: 400;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  color: inherit;
  word-break: keep-all;
`;

export default App;
