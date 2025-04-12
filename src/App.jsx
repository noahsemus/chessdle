import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styled, { createGlobalStyle } from "styled-components"; // Import styled-components

// --- Constants ---
const LICHESS_DAILY_PUZZLE_URL = "https://lichess.org/api/puzzle/daily";
const MAX_ATTEMPTS = 5;
// --- CORS Proxy (for testing/development ONLY) ---
// Uncomment the line below to try fetching via a public CORS proxy.
// const CORS_PROXY_URL = 'https://cors-anywhere.herokuapp.com/'; // Example proxy
const CORS_PROXY_URL = "https://api.allorigins.win/raw?url="; // Another proxy option (check terms)

// --- Helper Functions ---

/**
 * Parses Standard Algebraic Notation (SAN) using chess.js.
 * Requires the FEN string of the board *before* the move.
 * Returns a detailed move object or null if the move is illegal/invalid.
 */
const parseSanMove = (fenBeforeMove, san) => {
  const tempGame = new Chess(fenBeforeMove);
  try {
    const moveDetails = tempGame.move(san); // Stricter parsing (no sloppy)
    if (!moveDetails) return null; // Illegal or wrong turn
    return {
      piece: moveDetails.piece,
      from: moveDetails.from,
      to: moveDetails.to,
      san: moveDetails.san,
      color: moveDetails.color,
      promotion: moveDetails.promotion,
    };
  } catch (e) {
    // Catch potential exceptions for fundamentally invalid SAN
    return null;
  }
};

/**
 * Parses Universal Chess Interface (UCI) notation string.
 * e.g., "e2e4" or "a7a8q" (promotion)
 * Returns { from, to, promotion } object or null if invalid.
 */
const parseUci = (uci) => {
  if (!uci || uci.length < 4 || uci.length > 5) {
    return null;
  }
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promotion =
    uci.length === 5 ? uci.substring(4, 5).toLowerCase() : undefined;
  const validSquare = /^[a-h][1-8]$/;
  if (!validSquare.test(from) || !validSquare.test(to)) {
    return null;
  }
  if (promotion && !/^[qrbn]$/.test(promotion)) {
    return null;
  }
  return { from, to, promotion };
};

// --- Feedback Display Component ---
/**
 * Renders the feedback UI for a single attempt.
 */
function FeedbackDisplay({ userSequence, feedback }) {
  if (
    !feedback ||
    !userSequence ||
    userSequence.length !== feedback.length ||
    feedback.length === 0
  ) {
    // Return minimal error indication if props are invalid
    return (
      <div style={{ fontSize: "0.75rem", color: "red" }}>
        Invalid feedback data
      </div>
    );
  }
  return (
    <FeedbackList>
      {userSequence.map((move, index) => (
        // Use transient prop $feedbackType to avoid passing it to the DOM
        <FeedbackListItem key={index} $feedbackType={feedback[index]}>
          {userSequence.length > 1 ? `${index + 1}. ` : ""}
          {move || "?"}
        </FeedbackListItem>
      ))}
    </FeedbackList>
  );
}

// --- Main App Component ---
function App() {
  // --- State Variables ---
  const [puzzle, setPuzzle] = useState(null); // Holds fetched puzzle data { id, rating, initialFen, solution (UCI), playerColor }
  const [game, setGame] = useState(null); // chess.js instance for board interaction logic (currently unused after setup)
  const [currentFen, setCurrentFen] = useState("start"); // Current FEN string for the displayed chessboard
  const [userMoveSequence, setUserMoveSequence] = useState([]); // Holds SAN moves entered by user for the *current* attempt
  const [attemptsHistory, setAttemptsHistory] = useState([]); // Stores past attempts: [{ sequence: [SAN], feedback: [G/Y/R] }]
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(1); // Tracks the current attempt number (1-based)
  const [gameState, setGameState] = useState("loading"); // Overall game state: 'loading', 'playing', 'won', 'lost', 'error'
  const [errorMessage, setErrorMessage] = useState(""); // Stores error messages for display

  // --- Fetch Puzzle Data on Mount ---
  useEffect(() => {
    const fetchDailyPuzzle = async () => {
      // Reset state for new puzzle load
      setGameState("loading");
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
        // Fetch data via proxy
        const response = await fetch(targetUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Extract essential data
        let baseFen = data?.game?.fen;
        const pgn = data?.game?.pgn;
        const initialPly = data?.puzzle?.initialPly;
        const solution = data?.puzzle?.solution; // Expecting UCI array

        // Step 1: Derive Base FEN from PGN if not directly provided
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
            for (let i = 0; i < initialPly; i++) {
              if (!history[i]) throw new Error(`PGN history short`);
              tempChess.move(history[i]);
            }
            // Apply one additional move based on Lichess puzzle behavior
            const nextMoveIndex = initialPly;
            if (history[nextMoveIndex]) {
              const extraMoveResult = tempChess.move(history[nextMoveIndex]);
              // Warn if extra move fails, but proceed
              if (!extraMoveResult)
                console.warn(
                  `Could not apply the extra move (${history[nextMoveIndex]}) after initialPly.`
                );
            } else {
              console.warn(
                `No move found in PGN history at index ${nextMoveIndex} (initialPly).`
              );
            }
            baseFen = tempChess.fen(); // Get the final FEN
          } catch (pgnError) {
            throw new Error(
              `Failed to derive FEN from PGN: ${pgnError.message}`
            );
          }
        }

        // Step 2: Validate essential data AND derived/provided FEN
        if (!baseFen || !solution || solution.length === 0) {
          throw new Error("Incomplete puzzle data");
        }
        try {
          new Chess(baseFen);
        } catch (fenValidationError) {
          throw new Error(
            `Initial board state (FEN) is invalid: ${fenValidationError.message}`
          );
        }

        // Step 3: Correct FEN Turn Marker if needed
        let correctedFen = baseFen;
        const firstSolutionMoveUci = solution[0];
        const parsedFirstMove = parseUci(firstSolutionMoveUci);
        if (!parsedFirstMove) {
          throw new Error(
            `Invalid first solution move format: ${firstSolutionMoveUci}`
          );
        }

        let turnSeemsCorrect = false;
        try {
          // Check if the first solution move is valid from the base FEN state
          const tempGameForTurnCheck = new Chess(baseFen);
          if (tempGameForTurnCheck.move(parsedFirstMove) !== null)
            turnSeemsCorrect = true;
        } catch (turnCheckError) {
          /* Exception likely means invalid move/turn */
        }

        if (!turnSeemsCorrect) {
          // If move failed (null or exception), assume turn needs flipping
          const fenParts = baseFen.split(" ");
          if (fenParts.length >= 2) {
            const currentTurn = fenParts[1];
            const newTurn = currentTurn === "w" ? "b" : "w";
            fenParts[1] = newTurn;
            const flippedFen = fenParts.join(" ");
            // Double-check: can the move be made with the flipped turn?
            try {
              const tempGameAfterFlip = new Chess(flippedFen);
              if (tempGameAfterFlip.move(parsedFirstMove) !== null)
                correctedFen = flippedFen; // Use flipped if it works
              else
                console.error(
                  `Move still invalid after flipping turn. Puzzle data might be inconsistent.`
                );
            } catch (flipCheckError) {
              console.error(`Error checking flipped FEN:`, flipCheckError);
            }
          } else {
            console.error("Could not parse base FEN to flip turn marker.");
          }
        }
        // --- End of Step 3 ---

        // Step 4: Final Validation and State Update
        let finalInitialFen = correctedFen;
        let chessInstance;
        try {
          chessInstance = new Chess(finalInitialFen);
        } catch (fenError) {
          throw new Error(`Invalid final FEN: ${fenError.message}`);
        }

        // Set final state
        setPuzzle({
          id: data.puzzle.id || "unknown",
          rating: data.puzzle.rating || "N/A",
          initialFen: finalInitialFen,
          solution: solution, // Store UCI solution
          playerColor:
            finalInitialFen.split(" ")[1] === "w" ? "white" : "black",
        });
        setGame(chessInstance); // Store chess.js instance (optional, might not be needed elsewhere)
        setCurrentFen(finalInitialFen); // Set initial board display
        setGameState("playing"); // Ready to play
      } catch (err) {
        // Handle any error during fetch/processing
        console.error("Failed to fetch or process puzzle:", err);
        setErrorMessage(
          `Failed to load daily puzzle: ${
            err.message || "Unknown error"
          }. Please check console.`
        );
        setGameState("error");
      }
    };
    fetchDailyPuzzle();
  }, []); // Run only on component mount

  // --- Handle User Moves on Chessboard ---
  /**
   * Callback when a piece is dropped on the board.
   * Validates the move locally and updates the current attempt sequence and board display.
   */
  const onDrop = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (gameState !== "playing" || !game) {
        return false;
      } // Only allow moves while playing

      // Use a copy based on the *current displayed FEN* to validate the user's drop
      const gameCopy = new Chess(currentFen);
      let moveResult = null;
      try {
        // Attempt the move (always promote to queen for simplicity in puzzles)
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (error) {
        // Should rarely happen if source/target are valid squares
        console.error("Error attempting move:", error);
        return false;
      }

      // If move is illegal according to chess.js rules
      if (moveResult === null) {
        return false; // Reject the move, board state doesn't change
      }

      // Move is valid, update the displayed board and current sequence
      setCurrentFen(gameCopy.fen()); // Update display FEN
      const newSequence = [...userMoveSequence, moveResult.san]; // Add move in SAN format
      setUserMoveSequence(newSequence);

      return true; // Confirm move was successful
    },
    [game, currentFen, userMoveSequence, gameState]
  ); // Dependencies

  // --- Reset User Input for CURRENT attempt ---
  /**
   * Resets the board display to the puzzle's start and clears the current input sequence.
   */
  const handleResetInput = () => {
    if (!puzzle || !game || gameState !== "playing") {
      return;
    } // Only allow reset while playing
    try {
      setCurrentFen(puzzle.initialFen); // Reset board display
      setUserMoveSequence([]); // Clear current input
    } catch (err) {
      console.error("Error during input reset:", err);
      setErrorMessage("Error resetting input."); // Show error if reset fails
    }
  };

  // --- Submit and Validate Sequence ---
  /**
   * Validates the currently entered userMoveSequence against the puzzle solution.
   * Updates attempts history and game state (won/lost/playing).
   */
  const handleSubmit = () => {
    // Ensure submission is possible
    if (
      !puzzle ||
      !game ||
      !puzzle.solution ||
      userMoveSequence.length === 0 ||
      gameState !== "playing"
    ) {
      return;
    }

    const solutionMovesUci = puzzle.solution;
    const feedbackResults = []; // Stores G/Y/R feedback for this attempt
    let allCorrect = true; // Flag to track if all moves were green
    let validationGame; // Temporary chess.js instance for validation state

    try {
      // Start validation from the puzzle's initial state
      if (!puzzle.initialFen) throw new Error("Initial FEN missing");
      validationGame = new Chess(puzzle.initialFen);
    } catch (err) {
      console.error("Validation instance error:", err);
      setErrorMessage("Internal error: Could not initialize validation.");
      setGameState("error");
      return;
    }

    // Determine loop length based on the longer sequence
    const comparisonLength = Math.max(
      userMoveSequence.length,
      solutionMovesUci.length
    );

    // Loop through each move index
    for (let i = 0; i < comparisonLength; i++) {
      const currentValidationFen = validationGame.fen(); // FEN *before* this move index
      const userSan = userMoveSequence[i]; // User's move (SAN)
      const solutionUci = solutionMovesUci[i]; // Solution's move (UCI)
      let result = "red"; // Default feedback
      let advanceStateSuccess = true; // Assume state can advance

      // Parse both user's SAN and solution's UCI
      const userMoveObject = userSan
        ? parseSanMove(currentValidationFen, userSan)
        : null;
      const solutionMoveObject = solutionUci ? parseUci(solutionUci) : null;

      // Calculate Feedback only if user move was successfully parsed
      if (userMoveObject && solutionMoveObject) {
        // Check Green: Exact match of squares and promotion
        const isGreen =
          userMoveObject.from === solutionMoveObject.from &&
          userMoveObject.to === solutionMoveObject.to &&
          userMoveObject.promotion === solutionMoveObject.promotion;
        if (isGreen) {
          result = "green";
        } else {
          // Check Yellow: Correct start square OR correct destination square, but NOT both
          const pieceMatch = userMoveObject.from === solutionMoveObject.from;
          const destMatch = userMoveObject.to === solutionMoveObject.to;
          if ((pieceMatch || destMatch) && !(pieceMatch && destMatch)) {
            // XOR logic
            result = "yellow";
          }
          // If not Green or Yellow, result remains 'red'
        }
      } else {
        // Handle case where user move parsing failed (illegal move)
        result = "red";
        // Check if we can still provide Yellow based *only* on destination square match
        // This overrides the Red default if the user insists an illegal move landing
        // on the right square should be Yellow.
        if (userSan && !userMoveObject && solutionMoveObject) {
          // Try to extract destination from the user's likely illegal SAN input
          const sanDestMatch = userSan.match(/([a-h][1-8])\+?#?$/);
          const userIntendedDest = sanDestMatch ? sanDestMatch[1] : null;
          if (userIntendedDest && userIntendedDest === solutionMoveObject.to) {
            result = "yellow"; // Override to Yellow if destination matches
          }
        }
      }

      feedbackResults.push(result);
      if (result !== "green") {
        allCorrect = false;
      }

      // Advance internal validation board state using the CORRECT solution move
      if (solutionUci) {
        let moveApplied = null;
        try {
          moveApplied = validationGame.move(solutionUci); // Apply solution UCI
          if (!moveApplied) {
            // If solution move is illegal (e.g., bad puzzle data)
            console.warn(
              `Solution move ${i} (${solutionUci}) returned null (illegal) from FEN "${currentValidationFen}".`
            );
            advanceStateSuccess = false;
            if (result !== "red") {
              feedbackResults[feedbackResults.length - 1] = "red";
              allCorrect = false;
            }
            break; // Stop validation for this attempt
          }
        } catch (e) {
          // Catch exceptions applying solution move
          console.warn(
            `Solution move ${i} (${solutionUci}) exception: ${e.message}.`
          );
          advanceStateSuccess = false;
          if (result !== "red") {
            feedbackResults[feedbackResults.length - 1] = "red";
            allCorrect = false;
          }
          break; // Stop validation for this attempt
        }
      } else if (i < solutionMovesUci.length) {
        // Should not happen normally
        console.error(`Solution UCI missing at index ${i}`);
        setErrorMessage("Internal error: Missing solution data.");
        setGameState("error");
        return;
      } else {
        // Reached end of solution sequence
        advanceStateSuccess = false;
      }
    } // End of validation loop

    // Ensure feedback array matches user input length if user entered too many moves
    while (feedbackResults.length < userMoveSequence.length) {
      feedbackResults.push("red");
      allCorrect = false;
    }

    // --- Update Game State ---
    const newAttempt = {
      sequence: userMoveSequence,
      feedback: feedbackResults,
    };
    const updatedHistory = [...attemptsHistory, newAttempt];
    setAttemptsHistory(updatedHistory); // Store the completed attempt

    if (allCorrect) {
      // Check for win
      setGameState("won");
    } else if (currentAttemptNumber >= MAX_ATTEMPTS) {
      // Check for loss
      setGameState("lost");
    } else {
      // Continue playing: Increment attempt, reset input/board
      setGameState("playing");
      setCurrentAttemptNumber(currentAttemptNumber + 1);
      setUserMoveSequence([]); // Clear input sequence for next attempt
      if (puzzle) {
        setCurrentFen(puzzle.initialFen);
      } // Reset board display
    }
  };

  // --- Render Logic ---
  const isGameOver = gameState === "won" || gameState === "lost";
  if (gameState === "loading") {
    return (
      <AppWrapper>
        <Container>Loading...</Container>
      </AppWrapper>
    );
  }
  if (gameState === "error") {
    return (
      <AppWrapper>
        <Container>
          <p>Error:</p> <p>{errorMessage}</p>
          <p>Check console.</p>
        </Container>
      </AppWrapper>
    );
  }
  if (!puzzle || !game) {
    return (
      <AppWrapper>
        <Container>Waiting...</Container>
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
              {" "}
              Attempt {currentAttemptNumber} of {MAX_ATTEMPTS}. Enter the{" "}
              {puzzle.solution.length}-move solution. Turn:{" "}
              <TurnText>{puzzle.playerColor}</TurnText>{" "}
            </InfoText>
          )}

          {/* Display History */}
          <HistoryContainer>
            {attemptsHistory.map((attempt, index) => (
              <AttemptHistoryItem
                key={index}
                $isLastAttempt={index === attemptsHistory.length - 1} // Use $ prefix
                $isGameOver={isGameOver} // Use $ prefix
              >
                <AttemptLabel>Attempt {index + 1}:</AttemptLabel>
                <FeedbackDisplay
                  userSequence={attempt.sequence}
                  feedback={attempt.feedback}
                />
              </AttemptHistoryItem>
            ))}
          </HistoryContainer>

          {/* Display Current Attempt UI only if game is playing */}
          {!isGameOver && (
            <>
              <BoardWrapper>
                <Chessboard
                  key={puzzle.id}
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
                  {userMoveSequence.join(" ") || "(No moves entered yet)"}
                </CurrentSequenceMoves>
              </CurrentSequenceDisplay>
              <ControlsWrapper>
                <StyledButton
                  onClick={handleResetInput}
                  disabled={
                    userMoveSequence.length === 0 || gameState !== "playing"
                  }
                >
                  {" "}
                  Reset Input{" "}
                </StyledButton>
                <StyledButton
                  primary
                  onClick={handleSubmit}
                  disabled={
                    userMoveSequence.length === 0 || gameState !== "playing"
                  }
                >
                  {" "}
                  Submit Attempt {currentAttemptNumber}{" "}
                </StyledButton>
              </ControlsWrapper>
            </>
          )}

          {/* Display Win/Loss Messages */}
          {gameState === "won" && (
            <Message type="won">
              {" "}
              Correct! You solved it in {attemptsHistory.length} attempt
              {attemptsHistory.length > 1 ? "s" : ""}! 🎉{" "}
            </Message>
          )}
          {gameState === "lost" && (
            <Message type="lost">
              {" "}
              Game Over! Max attempts ({MAX_ATTEMPTS}) reached.{" "}
              <SolutionText>
                Correct Solution: {puzzle.solution.join(" ")}
              </SolutionText>{" "}
            </Message>
          )}
        </Container>
      </AppWrapper>
    </>
  );
}

// --- Global Styles ---
const GlobalStyle = createGlobalStyle`
  body { margin: 0; font-family: sans-serif; background-color: #f3f4f6; }
`;

// --- Styled Components ---
const AppWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;
const Container = styled.div`
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 1.5rem;
  max-width: 32rem;
  width: 100%;
  font-family: sans-serif;
`;
const Title = styled.h1`
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1rem;
  color: #1f2937;
`;
const InfoText = styled.p`
  text-align: center;
  font-size: 0.875rem;
  color: #4b5563;
  margin-bottom: ${(props) => props.marginBottom || "0.25rem"};
`;
const TurnText = styled.span`
  font-weight: 600;
`;
const HistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;
const AttemptHistoryItem = styled.div`
  padding: 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #e5e7eb;
  ${({ $isLastAttempt, $isGameOver }) =>
    $isLastAttempt &&
    $isGameOver &&
    ` border-width: 2px; border-color: #3b82f6; `}
`;
const AttemptLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #4b5563;
`;
const FeedbackList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  list-style: none;
  padding: 0;
  margin: 0;
`;
const FeedbackListItem = styled.li`
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-family: monospace;
  font-size: 0.75rem;
  background-color: ${(props) => {
    switch (props.$feedbackType) {
      case "green":
        return "#22c55e";
      case "yellow":
        return "#facc15";
      case "red":
        return "#ef4444";
      default:
        return "#d1d5db";
    }
  }};
  color: ${(props) =>
    props.$feedbackType === "yellow" || !props.$feedbackType
      ? "#1f2937"
      : "white"};
`;
const BoardWrapper = styled.div`
  max-width: 24rem;
  margin: 0 auto 1rem auto;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-radius: 0.25rem;
  overflow: hidden;
`;
const CurrentSequenceDisplay = styled.div`
  text-align: center;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background-color: #f9fafb;
  border-radius: 0.25rem;
  border: 1px solid #e5e7eb;
`;
const CurrentSequenceLabel = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin: 0 0 0.25rem 0;
`;
const CurrentSequenceMoves = styled.p`
  font-family: monospace;
  font-size: 0.75rem;
  word-break: break-all;
  color: #4b5563;
  height: 1.5rem;
  overflow-y: auto;
  margin: 0;
`;
const ControlsWrapper = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;
const StyledButton = styled.button`
  padding: 0.5rem 1rem;
  color: white;
  border-radius: 0.25rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  transition: background-color 150ms ease-in-out, opacity 150ms ease-in-out;
  border: none;
  cursor: pointer;
  background-color: ${(props) => (props.primary ? "#2563eb" : "#f59e0b")};
  &:hover {
    background-color: ${(props) => (props.primary ? "#1d4ed8" : "#d97706")};
  }
  &:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px
      ${(props) =>
        props.primary ? "rgba(59, 130, 246, 0.5)" : "rgba(245, 158, 11, 0.5)"};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    &:hover {
      background-color: ${(props) => (props.primary ? "#2563eb" : "#f59e0b")};
    }
  }
`;
const Message = styled.div`
  margin-top: 1rem;
  padding: 0.75rem;
  text-align: center;
  border-radius: 0.25rem;
  border-width: 1px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  background-color: ${(props) =>
    props.type === "won" ? "#dcfce7" : "#fee2e2"};
  color: ${(props) => (props.type === "won" ? "#166534" : "#991b1b")};
  border-color: ${(props) => (props.type === "won" ? "#86efac" : "#fecaca")};
`;
const SolutionText = styled.p`
  font-size: 0.75rem;
  margin-top: 0.25rem;
`;

export default App;
