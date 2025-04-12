import React, { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styled, { createGlobalStyle } from "styled-components";
import { motion, AnimatePresence } from "motion/react";

// --- Constants ---
const LICHESS_DAILY_PUZZLE_URL = "https://lichess.org/api/puzzle/daily";
const MAX_ATTEMPTS = 5;
const CORS_PROXY_URL = "https://api.allorigins.win/raw?url="; // Proxy for fetching data cross-origin

// --- Helper Functions ---

/**
 * Parses Standard Algebraic Notation (SAN) using chess.js.
 * Requires the FEN string of the board *before* the move.
 */
const parseSanMove = (fenBeforeMove, san) => {
  const tempGame = new Chess(fenBeforeMove);
  try {
    const moveDetails = tempGame.move(san); // Use strict parsing
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
    return null; // Invalid SAN or illegal move
  }
};

/**
 * Parses Universal Chess Interface (UCI) notation string (e.g., "e2e4", "a7a8q").
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

// --- Animation Variants ---

// Variants for the feedback list container (stagger effect)
const listVariants = {
  visible: {
    opacity: 1,
    transition: { when: "beforeChildren", staggerChildren: 0.05 },
  },
  hidden: { opacity: 0 },
};

// Variants for individual feedback list items
const itemVariants = {
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
  hidden: { opacity: 0, y: 10 },
};

// Variants for the win/loss message appearance/disappearance
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
 * Renders the animated feedback UI for a single attempt's move sequence.
 */
function AnimatedFeedbackDisplay({ userSequence, feedback }) {
  if (
    !feedback ||
    !userSequence ||
    userSequence.length !== feedback.length ||
    feedback.length === 0
  ) {
    return (
      <div style={{ fontSize: "0.75rem", color: "red" }}>
        Invalid feedback data
      </div>
    );
  }

  return (
    <FeedbackList variants={listVariants} initial="hidden" animate="visible">
      {userSequence.map((move, index) => (
        <FeedbackListItem
          key={index}
          $feedbackType={feedback[index]}
          variants={itemVariants}
          layout
          layoutId={index}
        >
          {userSequence.length > 1 ? `${index + 1}. ` : ""}
          {userSequence[index] || "?"}
        </FeedbackListItem>
      ))}
    </FeedbackList>
  );
}

/**
 * Main application component for the Chessdle game.
 */
function App() {
  // State variables
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null); // chess.js instance primarily for validation/setup
  const [currentFen, setCurrentFen] = useState("start"); // FEN for the displayed board
  const [userMoveSequence, setUserMoveSequence] = useState([]); // User's moves in SAN for the current attempt
  const [attemptsHistory, setAttemptsHistory] = useState([]); // History of attempts [{ sequence, feedback }]
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(1);
  const [gameState, setGameState] = useState("loading"); // 'loading', 'playing', 'won', 'lost', 'error'
  const [errorMessage, setErrorMessage] = useState("");

  // Fetch and process the daily puzzle on component mount
  useEffect(() => {
    const fetchDailyPuzzle = async () => {
      setGameState("loading");
      // Reset all game state for a new puzzle
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

      try {
        const response = await fetch(targetUrl);
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        let baseFen = data?.game?.fen;
        const pgn = data?.game?.pgn;
        const initialPly = data?.puzzle?.initialPly;
        const solution = data?.puzzle?.solution; // Array of UCI moves

        // Step 1: Derive Base FEN from PGN if not directly provided by the API
        if (
          !baseFen &&
          pgn &&
          initialPly !== undefined &&
          initialPly !== null
        ) {
          try {
            const tempChess = new Chess();
            tempChess.loadPgn(pgn, { sloppy: true });
            const history = tempChess.history();
            tempChess.reset();
            // Replay moves to the specified ply
            for (let i = 0; i < initialPly; i++) {
              if (!history[i]) throw new Error(`PGN history short at ply ${i}`);
              tempChess.move(history[i]);
            }
            // Lichess puzzles often require applying one more move (opponent's last move)
            const nextMoveIndex = initialPly;
            if (history[nextMoveIndex]) {
              tempChess.move(history[nextMoveIndex]);
            }
            baseFen = tempChess.fen();
          } catch (pgnError) {
            throw new Error(
              `Failed to derive FEN from PGN: ${pgnError.message}`
            );
          }
        }

        // Step 2: Validate essential data and the FEN
        if (!baseFen || !solution || solution.length === 0) {
          throw new Error("Incomplete puzzle data (missing FEN or solution).");
        }
        try {
          new Chess(baseFen);
        } catch (fenValidationError) {
          // Validate FEN format
          throw new Error(
            `Initial FEN ("${baseFen}") is invalid: ${fenValidationError.message}`
          );
        }

        // Step 3: Correct FEN Turn Marker if necessary based on the first solution move
        let correctedFen = baseFen;
        const firstSolutionMoveUci = solution[0];
        const parsedFirstMove = parseUci(firstSolutionMoveUci);
        if (!parsedFirstMove)
          throw new Error(
            `Invalid first solution move format: ${firstSolutionMoveUci}`
          );

        let turnSeemsCorrect = false;
        try {
          if (new Chess(baseFen).move(parsedFirstMove) !== null)
            turnSeemsCorrect = true;
        } catch (turnCheckError) {
          /* Assume turn needs flipping */
        }

        if (!turnSeemsCorrect) {
          const fenParts = baseFen.split(" ");
          if (fenParts.length >= 2) {
            const currentTurn = fenParts[1];
            const newTurn = currentTurn === "w" ? "b" : "w";
            fenParts[1] = newTurn;
            const flippedFen = fenParts.join(" ");
            // Double-check if the move works with the flipped turn
            try {
              if (new Chess(flippedFen).move(parsedFirstMove) !== null)
                correctedFen = flippedFen;
            } catch (flipCheckError) {
              /* Stick with original if check fails */
            }
          } else {
            correctedFen = baseFen;
          } // Fallback if FEN parsing fails
        }

        // Step 4: Final Validation and State Update
        let finalInitialFen = correctedFen;
        let chessInstance;
        try {
          chessInstance = new Chess(finalInitialFen);
        } catch (fenError) {
          throw new Error(
            `Invalid final FEN ("${finalInitialFen}"): ${fenError.message}`
          );
        }

        // Set the processed puzzle data into state
        setPuzzle({
          id: data.puzzle.id || `unknown_${Date.now()}`,
          rating: data.puzzle.rating || "N/A",
          initialFen: finalInitialFen,
          solution: solution,
          playerColor:
            finalInitialFen.split(" ")[1] === "w" ? "white" : "black",
        });
        setGame(chessInstance);
        setCurrentFen(finalInitialFen);
        setGameState("playing");
      } catch (err) {
        console.error("Failed to fetch or process puzzle:", err);
        setErrorMessage(
          `Failed to load daily puzzle: ${err.message || "Unknown error"}.`
        );
        setGameState("error");
      }
    };

    fetchDailyPuzzle();
  }, []); // Empty dependency array ensures this runs only once on mount

  /**
   * Handles piece drop events from the chessboard.
   * Validates the move locally and updates the board and current sequence.
   */
  const onDrop = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (gameState !== "playing" || !puzzle) return false;

      // Validate move against the *currently displayed* board state
      const gameCopy = new Chess(currentFen);
      let moveResult = null;
      try {
        // Attempt move, auto-promoting to queen for simplicity
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (error) {
        console.error("Error attempting move in chess.js:", error);
        return false;
      }

      if (moveResult === null) return false; // Illegal move

      // Update displayed board and user's current move sequence
      setCurrentFen(gameCopy.fen());
      setUserMoveSequence((prev) => [...prev, moveResult.san]);
      return true; // Signal success to react-chessboard
    },
    [currentFen, userMoveSequence, gameState, puzzle]
  );

  /**
   * Resets the current attempt's input sequence and board display.
   */
  const handleResetInput = () => {
    if (!puzzle || gameState !== "playing") return;
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
      userMoveSequence.length === 0 ||
      gameState !== "playing"
    )
      return;

    const solutionMovesUci = puzzle.solution;
    const feedbackResults = []; // Stores 'green', 'yellow', 'red'
    let allCorrect = true;
    let validationGame; // Use a separate chess instance for validation path

    try {
      if (!puzzle.initialFen) throw new Error("Initial FEN missing");
      validationGame = new Chess(puzzle.initialFen); // Start from puzzle's initial state
    } catch (err) {
      console.error("Validation instance creation error:", err);
      setErrorMessage("Internal error during validation setup.");
      setGameState("error");
      return;
    }

    const comparisonLength = Math.max(
      userMoveSequence.length,
      solutionMovesUci.length
    );

    // Compare user moves to solution moves step-by-step
    for (let i = 0; i < comparisonLength; i++) {
      const currentValidationFen = validationGame.fen(); // FEN before this move index
      const userSan = userMoveSequence[i];
      const solutionUci = solutionMovesUci[i];
      let result = "red"; // Default feedback

      const userMoveObject = userSan
        ? parseSanMove(currentValidationFen, userSan)
        : null;
      const solutionMoveObject = solutionUci ? parseUci(solutionUci) : null;

      // Calculate feedback (Green/Yellow/Red)
      if (userMoveObject && solutionMoveObject) {
        const isGreen = // Exact match?
          userMoveObject.from === solutionMoveObject.from &&
          userMoveObject.to === solutionMoveObject.to &&
          (userMoveObject.promotion || null) ===
            (solutionMoveObject.promotion || null);
        if (isGreen) {
          result = "green";
        } else {
          // Partial match (Yellow)?
          const fromMatch = userMoveObject.from === solutionMoveObject.from;
          const toMatch = userMoveObject.to === solutionMoveObject.to;
          if ((fromMatch || toMatch) && !(fromMatch && toMatch)) {
            // XOR
            result = "yellow";
          }
        }
      } else if (!userMoveObject && userSan && solutionMoveObject) {
        // Heuristic: Check if illegal user move's *intended* destination matches solution (Yellow)
        const sanDestMatch = userSan.match(/([a-h][1-8])=?([qrbn])?[+#]?$/i);
        const userIntendedDest = sanDestMatch ? sanDestMatch[1] : null;
        if (userIntendedDest && userIntendedDest === solutionMoveObject.to) {
          result = "yellow";
        }
      }
      // Else: remains 'red'

      feedbackResults.push(result);
      if (result !== "green") allCorrect = false;

      // Advance internal validation board state using the *correct* solution move
      if (solutionUci && solutionMoveObject) {
        try {
          if (!validationGame.move(solutionMoveObject)) {
            console.warn(
              `Solution move ${i} (${solutionUci}) illegal from FEN "${currentValidationFen}".`
            );
            if (result !== "red")
              feedbackResults[feedbackResults.length - 1] = "red";
            allCorrect = false;
            break; // Stop validation if solution path breaks
          }
        } catch (e) {
          console.error(
            `Error applying solution move ${i} (${solutionUci}): ${e.message}`
          );
          if (result !== "red")
            feedbackResults[feedbackResults.length - 1] = "red";
          allCorrect = false;
          break;
        }
      } else if (i < solutionMovesUci.length) {
        // Handle invalid solution UCI format
        console.error(
          `Solution UCI at index ${i} ("${solutionUci}") is invalid.`
        );
        setErrorMessage("Internal error: Invalid solution data.");
        setGameState("error");
        return;
      }
    } // End validation loop

    // Mark any extra user moves as 'red'
    while (feedbackResults.length < userMoveSequence.length) {
      feedbackResults.push("red");
      allCorrect = false;
    }

    // Update history and game state
    const newAttempt = {
      sequence: userMoveSequence,
      feedback: feedbackResults,
    };
    setAttemptsHistory((prev) => [...prev, newAttempt]);

    if (allCorrect && userMoveSequence.length === solutionMovesUci.length) {
      setGameState("won");
    } else if (currentAttemptNumber >= MAX_ATTEMPTS) {
      setGameState("lost");
    } else {
      // Continue playing
      setGameState("playing");
      setCurrentAttemptNumber((prev) => prev + 1);
      setUserMoveSequence([]); // Clear input for next attempt
      if (puzzle) setCurrentFen(puzzle.initialFen); // Reset board display
    }
  }; // End handleSubmit

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
          <p style={{ color: "red", fontWeight: "bold" }}>Error:</p>
          <p>{errorMessage}</p>
          <p style={{ fontSize: "0.8em", color: "#555" }}>
            Please try refreshing. Check console for details.
          </p>
        </Container>
      </AppWrapper>
    );
  }

  if (!puzzle) {
    // Should not happen if loading/error states handled
    return (
      <AppWrapper>
        <Container>Waiting for puzzle data...</Container>
      </AppWrapper>
    );
  }

  return (
    <>
      <GlobalStyle />
      <AppWrapper>
        <Container>
          <Title>Chessdle</Title>
          <InfoText>Rating: {puzzle.rating}</InfoText>
          {!isGameOver && (
            <InfoText marginBottom="1rem">
              Attempt {currentAttemptNumber} of {MAX_ATTEMPTS}. Enter the{" "}
              {puzzle.solution.length}-move solution. Turn:{" "}
              <TurnText>{puzzle.playerColor}</TurnText>
            </InfoText>
          )}

          {/* Display History */}
          <HistoryContainer>
            {attemptsHistory.map((attempt, index) => (
              <AttemptHistoryItem
                key={index}
                $isLastAttempt={index === attemptsHistory.length - 1}
                $isGameOver={isGameOver}
                layout
                layoutId={index}
              >
                <AttemptLabel>Attempt {index + 1}:</AttemptLabel>
                <AnimatedFeedbackDisplay
                  userSequence={attempt.sequence}
                  feedback={attempt.feedback}
                />
              </AttemptHistoryItem>
            ))}
          </HistoryContainer>

          {/* Display Board & Controls only while playing */}
          {gameState === "playing" && (
            <>
              <BoardWrapper>
                <Chessboard
                  key={`${puzzle.id}-${currentAttemptNumber}`} // Force re-render on new attempt if needed
                  id="ChessdleBoard"
                  position={currentFen}
                  onPieceDrop={onDrop}
                  boardOrientation={puzzle.playerColor}
                  arePiecesDraggable={gameState === "playing"}
                  customBoardStyle={{
                    borderRadius: "4px",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                  }}
                  customDarkSquareStyle={{ backgroundColor: "#769656" }}
                  customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
                />
              </BoardWrapper>
              <CurrentSequenceDisplay>
                <CurrentSequenceLabel>
                  Current sequence ({userMoveSequence.length}/
                  {puzzle.solution.length} moves):
                </CurrentSequenceLabel>
                <CurrentSequenceMoves>
                  {userMoveSequence.join(" ") || "(Drag pieces to make moves)"}
                </CurrentSequenceMoves>
              </CurrentSequenceDisplay>
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

          {/* Win/Loss Message Animation (using Framer Motion) */}
          <AnimatePresence>
            {gameState === "won" && (
              <Message
                key="win-message" // Required for AnimatePresence
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
                key="lost-message" // Required for AnimatePresence
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
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  * { box-sizing: border-box; }
`;

// --- Styled Components --- (Using motion elements where animated)

const AppWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
`;

const Container = styled.div`
  background-color: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 2rem;
  max-width: 40rem;
  width: 100%;
  font-family: inherit;
`;

const Title = styled.h1`
  font-size: 2rem;
  line-height: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1.5rem;
  color: #111827;
`;

const InfoText = styled.p`
  text-align: center;
  font-size: 0.9rem;
  color: #4b5563;
  margin-bottom: ${(props) => props.marginBottom || "0.5rem"};
  line-height: 1.4;
`;

const TurnText = styled.span`
  font-weight: 600;
  text-transform: capitalize;
`;

const HistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 0.75rem;
  background-color: #f9fafb;
`;

const AttemptHistoryItem = styled(motion.div)`
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid #d1d5db;
  background-color: #ffffff;
  ${({ $isLastAttempt, $isGameOver }) =>
    $isLastAttempt &&
    $isGameOver &&
    `border-width: 2px; border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);`}
`;

const AttemptLabel = styled.p`
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.375rem;
  color: #374151;
`;

// Wraps motion.ul for list animation control
const FeedbackList = styled(motion.ul)`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  list-style: none;
  padding: 0;
  margin: 0;
`;

// Wraps motion.li for individual item animation
const FeedbackListItem = styled(motion.li)`
  padding: 0.25rem 0.6rem;
  border-radius: 0.375rem;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 0.8rem;
  font-weight: 500;
  background-color: ${(props) => {
    /* Color logic based on $feedbackType */
    switch (props.$feedbackType) {
      case "green":
        return "#10b981";
      case "yellow":
        return "#f59e0b";
      case "red":
        return "#ef4444";
      default:
        return "#d1d5db";
    }
  }};
  color: ${(props) => (props.$feedbackType === "yellow" ? "#1f2937" : "white")};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

const BoardWrapper = styled.div`
  max-width: 30rem;
  margin: 0 auto 1.5rem auto;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-radius: 0.375rem;
  overflow: hidden;
`;

const CurrentSequenceDisplay = styled.div`
  text-align: center;
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background-color: #f9fafb;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
`;

const CurrentSequenceLabel = styled.p`
  font-size: 0.9rem;
  font-weight: 500;
  color: #374151;
  margin: 0 0 0.375rem 0;
`;

const CurrentSequenceMoves = styled.p`
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier,
    monospace;
  font-size: 0.85rem;
  word-break: break-all;
  color: #4b5563;
  min-height: 1.5rem;
  line-height: 1.5;
  margin: 0;
  background-color: #ffffff;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #d1d5db;
`;

const ControlsWrapper = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const StyledButton = styled.button`
  padding: 0.6rem 1.2rem;
  color: white;
  border-radius: 0.375rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  transition: background-color 150ms ease-in-out, opacity 150ms ease-in-out,
    box-shadow 150ms ease-in-out;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  background-color: ${(props) => (props.primary ? "#3b82f6" : "#f97316")};
  &:hover {
    background-color: ${(props) => (props.primary ? "#2563eb" : "#ea580c")};
  }
  &:focus-visible {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px
      ${(props) =>
        props.primary ? "rgba(59, 130, 246, 0.5)" : "rgba(249, 115, 22, 0.5)"};
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    &:hover {
      background-color: ${(props) => (props.primary ? "#3b82f6" : "#f97316")};
    }
  }
`;

// Wraps motion.div for win/loss message animation
const Message = styled(motion.div)`
  margin-top: 1rem;
  padding: 1rem;
  text-align: center;
  border-radius: 0.5rem;
  border-width: 1px;
  border-style: solid;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  font-size: 1rem;
  font-weight: 500;
  background-color: ${(props) =>
    props.type === "won" ? "#dcfce7" : "#fee2e2"};
  color: ${(props) => (props.type === "won" ? "#166534" : "#991b1b")};
  border-color: ${(props) => (props.type === "won" ? "#86efac" : "#fecaca")};
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
