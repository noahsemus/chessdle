import React, { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import styled, { createGlobalStyle } from "styled-components";
import { motion, AnimatePresence } from "motion/react";

// --- Constants ---
const LICHESS_DAILY_PUZZLE_URL = "https://lichess.org/api/puzzle/daily";
const MAX_ATTEMPTS = 5;
const CORS_PROXY_URL = "https://api.allorigins.win/raw?url="; // CORS Proxy
const BOARD_RESET_DELAY = 500; // Delay in ms before resetting board visually after failed attempt
const LOCAL_STORAGE_KEY_PREFIX = "chessdle_progress_"; // Prefix for localStorage keys
// Suffix for localStorage key to track if the 'How it Works' modal has been seen for a specific puzzle
const LOCAL_STORAGE_SEEN_MODAL_SUFFIX = "_seen_modal";
const GITHUB_URL = "https://github.com/noahsemus/chessdle";

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
  exit: { opacity: 0, y: -5, transition: { duration: 0.15 } },
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
const modalBackdropVariants = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};
const modalContentVariants = {
  hidden: { y: "-50px", opacity: 0 },
  visible: {
    y: "0",
    opacity: 1,
    transition: { type: "spring", stiffness: 150, damping: 20 },
  },
  exit: { y: "50px", opacity: 0 },
};

// --- Components ---

/**
 * Renders the animated feedback UI (colored squares) for a single attempt's move sequence.
 * Added attemptIndex prop to ensure unique keys/layoutIds across all attempts.
 */
function AnimatedFeedbackDisplay({ userSequence, feedback, attemptIndex }) {
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
          color: "var(--state-red-55)",
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
          // Ensure key and layoutId are unique across all attempts by including attemptIndex
          key={`${attemptIndex}-${index}-${move}`}
          $feedbackType={feedback[index]}
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          layout
          layoutId={`${attemptIndex}-${index}-${move}`}
        >
          {userSequence.length > 1 ? `${index + 1}. ` : ""}
          {move || "?"}
        </FeedbackListItem>
      ))}
    </FeedbackList>
  );
}

function HowItWorksModal({ isOpen, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <ModalBackdrop
          variants={modalBackdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
          aria-modal="true"
          role="dialog"
          aria-labelledby="how-it-works-title"
        >
          <ModalContent
            variants={modalContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <CloseButton
              onClick={onClose}
              aria-label="Close how it works modal"
            >
              &times;
            </CloseButton>
            <ModalScrollContainer>
              <ModalTitle id="how-it-works-title">♟️ Chessdle Rules</ModalTitle>
              <ModalBody>
                <p>
                  Chessdle presents you with the Lichess Puzzle of the Day. Your
                  goal is to figure out the{" "}
                  <strong>entire sequence of moves</strong> that solves the
                  puzzle.
                </p>
                <p>
                  <strong>How it works:</strong> You recieve feedback for each
                  move in your sequence:
                  <ul>
                    <li>
                      <strong>🟩 Green:</strong> Correct move! You moved the
                      correct piece to the correct destination.
                    </li>
                    <li>
                      <strong>🟨 Yellow:</strong> Partially correct! EITHER you
                      moved the correct piece to the wrong destination, OR you
                      moved a different piece but landed on the correct
                      destination.
                    </li>
                    <li>
                      <strong>🟥 Red:</strong> Incorrect.
                    </li>
                  </ul>
                </p>
                <p>
                  <strong>Guessing:</strong> You have {MAX_ATTEMPTS} attempts to
                  guess the entire sequence correctly.
                </p>

                <p>Good luck!</p>
              </ModalBody>
            </ModalScrollContainer>
          </ModalContent>
        </ModalBackdrop>
      )}
    </AnimatePresence>
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
  // Added state for modal visibility
  const [isHowItWorksModalOpen, setIsHowItWorksModalOpen] = useState(false);

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
      // Added: ensure modal is closed initially
      setIsHowItWorksModalOpen(false);

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
        const puzzleId =
          data.puzzle?.id ||
          `lichess_daily_${new Date().toISOString().split("T")[0]}`;
        const puzzleRating = data.puzzle?.rating || "N/A";

        // Store the fetched and processed puzzle data
        const newPuzzleData = {
          id: puzzleId,
          rating: puzzleRating,
          initialFen: finalInitialFen,
          solution: solution, // Store as UCI
          playerColor: playerColor,
        };
        setPuzzle(newPuzzleData);
        setGame(chessInstance);
        setCurrentFen(finalInitialFen); // Set initial board display

        // --- Load Saved Progress from LocalStorage
        let loadedStateSuccessfully = false; // Assume failure initially
        const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${puzzleId}`;
        // Define key for modal seen status
        const seenModalKey = `${storageKey}${LOCAL_STORAGE_SEEN_MODAL_SUFFIX}`;
        try {
          const savedDataString = localStorage.getItem(storageKey);
          // Check if modal has been seen
          const hasSeenModal = localStorage.getItem(seenModalKey) === "true";

          if (savedDataString) {
            console.log("Found saved progress for puzzle:", puzzleId);
            const savedData = JSON.parse(savedDataString);

            // Check if the saved state indicates the puzzle was already completed
            if (
              savedData.gameState === "won" ||
              savedData.gameState === "lost"
            ) {
              console.log(
                `Saved state for puzzle ${puzzleId} is '${savedData.gameState}'. Ignoring saved state and starting fresh.`
              );
              // Remove the completed state entry to prevent loading it again
              localStorage.removeItem(storageKey);
              // Do NOT set loadedStateSuccessfully = true;
            }
            // Else, check if the saved data is valid and represents an ongoing game
            else if (
              savedData &&
              Array.isArray(savedData.attemptsHistory) &&
              typeof savedData.currentAttemptNumber === "number" &&
              savedData.gameState === "playing" // Explicitly check for 'playing' state to restore
            ) {
              // Restore state ONLY if it was 'playing'
              setAttemptsHistory(savedData.attemptsHistory);
              setCurrentAttemptNumber(savedData.currentAttemptNumber);
              setGameState(savedData.gameState); // Restore 'playing' state
              // Ensure board reflects initial state if game is still playing
              setCurrentFen(finalInitialFen);
              loadedStateSuccessfully = true; // Mark loading as successful
              console.log("Restored 'playing' state:", savedData);
            } else {
              // Invalid or non-'playing' data found
              console.warn(
                `Invalid or non-restorable (${
                  savedData.gameState || "unknown"
                }) data found in localStorage for this puzzle, starting fresh.`
              );
              localStorage.removeItem(storageKey); // Clear invalid/non-restorable data
            }
          } else {
            console.log("No saved progress found for puzzle:", puzzleId);
          }

          // Open modal only if no state loaded AND modal not seen before
          if (!loadedStateSuccessfully && !hasSeenModal) {
            setIsHowItWorksModalOpen(true);
          }
        } catch (storageError) {
          console.error("Error reading from localStorage:", storageError);
          localStorage.removeItem(storageKey); // Clear potentially corrupted data
        }

        // Set to 'playing' only if no valid 'playing' state was loaded from localStorage
        if (!loadedStateSuccessfully) {
          setGameState("playing");
          console.log(
            "Setting gameState to 'playing' as no valid saved state was loaded."
          );
        }
        // --- Load Saved Progress from LocalStorage ---

        console.log("Puzzle loaded successfully:", {
          id: puzzleId,
          rating: puzzleRating,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  // --- Effect to Save Progress to LocalStorage
  useEffect(() => {
    // Persist state to localStorage whenever relevant state changes, but only if a puzzle is loaded
    if (
      puzzle &&
      puzzle.id &&
      gameState !== "loading" &&
      gameState !== "error"
    ) {
      const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${puzzle.id}`;
      // Only save if the state is 'playing', 'won', or 'lost'. Avoid saving intermediate states.
      if (["playing", "won", "lost"].includes(gameState)) {
        const dataToSave = {
          attemptsHistory,
          currentAttemptNumber,
          gameState,
        };
        try {
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        } catch (storageError) {
          console.error(
            "Error writing game state to localStorage:",
            storageError
          );
        }
      }
    }
    // Dependencies: Save when these state variables change after initial load
  }, [attemptsHistory, currentAttemptNumber, gameState, puzzle]);
  // --- End Effect to Save Progress ---

  // --- Callbacks ---

  /**
   * Handles piece drop events from react-chessboard.
   * Validates the move and updates state if legal.
   */
  const onDrop = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (gameState !== "playing" || !puzzle || !currentFen) return false;

      // If starting a new sequence after a submit, ensure the board is visually reset first
      // This handles cases where the timeout might not have finished before user interaction
      if (userMoveSequence.length === 0) {
        // Use the initial FEN for validation when starting a new sequence
        const gameForFirstMove = new Chess(puzzle.initialFen);
        let moveResult = null;
        try {
          moveResult = gameForFirstMove.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: "q",
          });
        } catch (error) {
          console.error("Error attempting first move of new sequence:", error);
          return false;
        }
        if (moveResult === null) {
          console.log(
            `Illegal first move attempted: ${sourceSquare}-${targetSquare}`
          );
          return false;
        }
        console.log(`Valid first move made: ${moveResult.san}`);
        setCurrentFen(gameForFirstMove.fen()); // Update board state
        setUserMoveSequence([moveResult.san]); // Start the sequence
        return true;
      }

      if (userMoveSequence.length >= puzzle.solution.length) {
        console.log("Maximum sequence length reached. Move prevented.");
        return false;
      }

      if (typeof Chess === "undefined") {
        console.error("Chess.js not loaded in onDrop callback.");
        return false;
      }
      const gameCopy = new Chess(currentFen); // Use the current FEN for subsequent moves
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
    [currentFen, gameState, puzzle, userMoveSequence]
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
    // Add attempt to history - triggers localStorage save via useEffect
    setAttemptsHistory((prev) => [...prev, newAttempt]);

    if (allCorrect && userMoveSequence.length === solutionMovesUci.length) {
      setGameState("won"); // Triggers localStorage save
      console.log("Game Won!");
      setUserMoveSequence([]); // Clear input sequence on win
    } else if (currentAttemptNumber >= MAX_ATTEMPTS) {
      setGameState("lost"); // Triggers localStorage save
      console.log("Game Lost - Max attempts reached.");
      setUserMoveSequence([]); // Clear input sequence on loss
    } else {
      // Continue playing - Failed attempt
      setCurrentAttemptNumber((prev) => prev + 1); // Triggers localStorage save
      setUserMoveSequence([]); // Clear input sequence for next attempt
      setGameState("playing"); // Ensure state is playing (also triggers save)

      // Delay visual board reset
      console.log(
        `Attempt ${currentAttemptNumber} failed. Delaying board reset.`
      );
      // Use functional updates within setTimeout to avoid stale state issues
      setTimeout(() => {
        setGameState((currentGameState) => {
          setCurrentAttemptNumber((currentNum) => {
            // Read current number inside timeout
            // Check conditions again inside the timeout
            if (currentGameState === "playing" && puzzle) {
              setCurrentFen(puzzle.initialFen); // Reset board display after delay
              console.log(
                `Board reset visually to ${puzzle.initialFen} for attempt ${currentNum}.`
              );
            } else {
              console.log(
                "Board reset skipped as game state changed, puzzle is missing, or attempt number mismatch post-delay."
              );
            }
            return currentNum; // No change to attempt number here
          });
          return currentGameState; // No change to game state here
        });
      }, BOARD_RESET_DELAY);

      console.log(
        `Proceeding to attempt ${
          currentAttemptNumber + 1 // Log the *next* attempt number correctly
        }.`
      );
    }
  }; // --- End handleSubmit ---

  const openModal = () => setIsHowItWorksModalOpen(true);
  const closeModal = () => {
    setIsHowItWorksModalOpen(false);
    // Mark modal as seen in localStorage when closed
    if (puzzle && puzzle.id) {
      const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${puzzle.id}`;
      const seenModalKey = `${storageKey}${LOCAL_STORAGE_SEEN_MODAL_SUFFIX}`;
      try {
        localStorage.setItem(seenModalKey, "true");
        console.log(`Marked modal as seen for puzzle: ${puzzle.id}`);
      } catch (e) {
        console.error(
          "Could not write to localStorage to mark modal as seen:",
          e
        );
      }
    }
  };

  // --- Render Logic ---
  const isGameOver = gameState === "won" || gameState === "lost";
  const isLastAttempt = currentAttemptNumber === MAX_ATTEMPTS;

  if (gameState === "loading") {
    return (
      <>
        <GlobalStyle />
        <AppWrapper>
          <Container>Loading Daily Puzzle...</Container>
        </AppWrapper>
      </>
    );
  }

  if (gameState === "error") {
    return (
      <>
        <GlobalStyle />
        <AppWrapper>
          <Container>
            <InfoText
              style={{
                color: "var(--state-red-55)",
                fontWeight: "bold",
              }}
            >
              Error:
            </InfoText>
            <InfoText style={{ color: "var(--state-white-50)" }}>
              {errorMessage}
            </InfoText>
          </Container>
        </AppWrapper>
      </>
    );
  }

  if (!puzzle) {
    return (
      <>
        <GlobalStyle />
        <AppWrapper>
          <Container>Waiting for puzzle data...</Container>
        </AppWrapper>
      </>
    );
  }

  // --- Main Game Render ---
  return (
    <>
      <GlobalStyle />
      <HowItWorksModal isOpen={isHowItWorksModalOpen} onClose={closeModal} />

      <AppWrapper>
        <Container>
          <TopContainer layout>
            <TitleContainer>
              <Title>Chessdle!</Title>
              <InfoText>
                Lichess' puzzle of the day, but puzzle-fied.
                <br></br>
                Guess the whole sequence!
              </InfoText>
            </TitleContainer>
            <InfoText>Rating: {puzzle.rating}</InfoText>
            {!isGameOver && (
              <InfoText>
                {`Attempt ${currentAttemptNumber} of ${MAX_ATTEMPTS}. Find the
                ${puzzle.solution.length}-move solution. `}
                <TurnText>{puzzle.playerColor} to move</TurnText>
              </InfoText>
            )}
          </TopContainer>

          <>
            <BoardWrapper layout="position">
              <Chessboard
                // Use puzzle ID and initial FEN in key to ensure re-render on new puzzle,
                // but NOT attempt number, to prevent reset on failed attempt state change
                key={`${puzzle.id}-${puzzle.initialFen}`}
                id="ChessdleBoard"
                position={currentFen}
                onPieceDrop={onDrop}
                boardOrientation={puzzle.playerColor}
                arePiecesDraggable={gameState === "playing"}
                customBoardStyle={{
                  borderRadius: "4px",
                  boxShadow: "0 4px 15px var(--state-shadow-dark)",
                }}
                customDarkSquareStyle={{
                  backgroundColor: "var(--dark-green-600)",
                }}
                customLightSquareStyle={{
                  backgroundColor: "var(--dark-green-300)",
                }}
              />
            </BoardWrapper>

            <BottomContainer layout>
              {/* Current Input Sequence */}
              <CurrentSequenceDisplay>
                <CurrentSequenceLabel>
                  Current sequence ({userMoveSequence.length}/
                  {puzzle.solution.length} moves):
                </CurrentSequenceLabel>
                <CurrentSequenceMoves layout>
                  <AnimatePresence>
                    {userMoveSequence.length > 0 ? (
                      userMoveSequence.map((move, index) => (
                        <FeedbackListItem
                          key={`${index}-${move}`} // Key only needs to be unique within this list
                          $feedbackType={undefined} // Use default/neutral style
                          variants={itemVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit" // Use exit variant defined in itemVariants
                          layout
                        >
                          {`${index + 1}. `}
                          {move}
                        </FeedbackListItem>
                      ))
                    ) : (
                      <PlaceholderText
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {gameState === "playing"
                          ? "Drag pieces to make moves"
                          : "Game Over"}
                      </PlaceholderText>
                    )}
                  </AnimatePresence>
                </CurrentSequenceMoves>
              </CurrentSequenceDisplay>

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
                      <AttemptLabel layout>Attempt {index + 1}:</AttemptLabel>
                      <AnimatedFeedbackDisplay
                        userSequence={attempt.sequence}
                        feedback={attempt.feedback}
                        attemptIndex={index}
                      />
                    </AttemptHistoryItem>
                  ))}
                </AnimatePresence>
              </HistoryContainer>

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
                  $isLastAttempt={isLastAttempt && gameState === "playing"}
                  onClick={handleSubmit}
                  disabled={
                    userMoveSequence.length === 0 || gameState !== "playing"
                  }
                >
                  {isLastAttempt && gameState === "playing"
                    ? "Submit Last Attempt"
                    : `Submit Attempt ${currentAttemptNumber}`}
                </StyledButton>
              </ControlsWrapper>
            </BottomContainer>
          </>

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
            <ButtonContainer>
              <GitHubButton
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="github-mark-white.svg"
                  alt="GitHub logo"
                  style={{ height: "1em", width: "1em", opacity: 0.5 }}
                />
                Check out the source code!
              </GitHubButton>
              <HowItWorksButton onClick={openModal}>
                Chessdle Rules
              </HowItWorksButton>
            </ButtonContainer>
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
    --dark-green-200: #b2dfdb; /* Won Message Text */
    --dark-green-300: #80cbc4; /* Board Light Squares */
    --dark-green-400: #4db6ac; /* Primary Accent (Buttons, Focus Rings) */
    --dark-green-500: #26a69a; /* Feedback Green, Button Hover, Won Border */
    --dark-green-600: #00897b; /* Board Dark Squares */
    --dark-green-700: #00796b; /* Default Feedback Bg, Close Button Hover Bg */
    --dark-green-800: #11534c; /* Secondary Backgrounds (History, Input, Modal) */
    --dark-green-900: #00251f; /* Primary Background */

    --orange-500: #ffa726; /* Feedback Yellow */
    --orange-700: #f57c00; /* Secondary Button Background */
    --orange-800: #ef6c00; /* Secondary Button Hover Background */

    --neutral-100: #eceff1; /* Primary Text */
    --neutral-200: #cfd8dc; /* Modal Body Text, Emphasis Text */
    --neutral-900: #37474f; /* Button Text, Green/Yellow Feedback Text */

    /* State/Opacity Variables */
    --state-white-05: rgba(255, 255, 255, 0.05);
    --state-white-10: rgba(255, 255, 255, 0.1);
    --state-white-25: rgba(255, 255, 255, 0.25);
    --state-white-50: rgba(255, 255, 255, 0.5);

    --state-black-10: rgba(0, 0, 0, 0.1);
    --state-black-20: rgba(0, 0, 0, 0.2);
    --state-black-30: rgba(0, 0, 0, 0.3);
    --state-black-60: rgba(0, 0, 0, 0.6);

    --state-shadow-dark: rgba(0, 20, 15, 1);

    --state-red-55: rgba(255, 0, 0, 0.555);
    --state-red-60: rgba(255, 0, 0, 0.6);

    --state-dark-green-30: rgba(77, 182, 172, 0.3); /* Based on --dark-green-400 */
    --state-orange-60: rgba(255, 167, 38, 0.6); /* Based on --orange-500 */

    /* Feedback Colors (keeping hex for hover) */
    --feedback-red-hover: #dc2626; /* Last Attempt Button Hover */

    /* Button Colors */
    --button-disabled-opacity: 0.6;
    --message-lost-bg: #5f2120; /* Lost Message Background */
    --message-lost-text: #fecaca; /* Lost Message Text */
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'National Park', serif;
    letter-spacing: .1ch;
    background-color: var(--dark-green-900);
    color: var(--neutral-100);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .react-chessboard svg { max-width: 100%; height: auto; display: block; }

  /* Basic list styling (used within modal) */
  ol, ul {
    padding-left: 1.5rem;
    margin-top: 0.5rem;
    margin-bottom: 1rem;
  }
  li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }
  strong {
    font-weight: 600;
    color: var(--neutral-100);
  }
  em {
    font-style: italic;
    color: var(--neutral-200);
  }
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
  padding-bottom: 8rem;
  max-width: 45rem;
  width: 100%;
  text-align: center;

  @media (max-width: 700px) {
    padding: 1rem;
    padding-bottom: 4rem;
  }
`;

const TopContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1.5rem;
  position: relative;
`;

const InfoText = styled.p`
  text-align: center;
  font-size: 0.9rem;
  color: var(--state-white-50);
  line-height: 1.4;
`;

const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-bottom: 1rem;

  & > ${InfoText} {
    font-size: 0.8rem;
    opacity: 0.75;
  }
`;

const Title = styled.h1`
  font-size: 4rem;
  letter-spacing: -0.05ch;
  line-height: 100%;
  font-weight: 700;
  text-align: center;
  color: var(--neutral-100);
  padding-bottom: 1rem;
`;

const TurnText = styled.span`
  font-weight: 600;
  text-transform: capitalize;
  color: var(--neutral-100);
`;

const HistoryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const AttemptHistoryItem = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  text-align: left;
  padding-top: 0.75rem;
  border-radius: 0.375rem;
  background-color: var(--dark-green-800);
  ${({ $isLastAttempt, $isGameOver }) =>
    $isLastAttempt &&
    $isGameOver &&
    `
      box-shadow: 0 0 0 2px var(--state-dark-green-30);
    `}
`;

const AttemptLabel = styled(motion.p)`
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--state-white-50);
`;

const FeedbackList = styled(motion.ul)`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  list-style: none;
  padding: 0;
  margin: 0;
`;

const FeedbackListItem = styled(motion.div)`
  width: 6rem;
  padding: 0.25rem 0.6rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: ${(props) =>
    props.$feedbackType === "green" || props.$feedbackType === "yellow"
      ? 800
      : 500};
  background-color: ${(props) => {
    switch (props.$feedbackType) {
      case "green":
        return "var(--dark-green-500)";
      case "yellow":
        return "var(--orange-500)";
      case "red":
        return "var(--state-red-55)";
      default:
        return "var(--dark-green-700)";
    }
  }};
  color: ${(props) =>
    props.$feedbackType === "green" || props.$feedbackType === "yellow"
      ? "var(--neutral-900)"
      : "var(--neutral-100)"};
  box-shadow: 0 1px 2px var(--state-black-10);
  line-height: 1.2;
  text-align: center;
`;

const PlaceholderText = styled(motion.span)`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--state-white-25);
  white-space: nowrap;
`;

const BoardWrapper = styled(motion.div)`
  border-radius: 0.375rem;
  padding: 1rem 0 3rem 0;
  overflow: visible;

  & > * {
    box-shadow: 0 8px 24px var(--state-black-30);
  }
`;

const BottomContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const CurrentSequenceDisplay = styled.div`
  text-align: center;
`;

const CurrentSequenceLabel = styled.p`
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--state-white-50);
  margin: 0 0 0.375rem 0;
`;

const CurrentSequenceMoves = styled(motion.div)`
  position: relative;
  font-size: 0.85rem;
  word-break: break-all;
  color: var(--neutral-100);
  min-height: 3rem;
  line-height: 1.5;
  margin: 0;
  background-color: var(--dark-green-800);
  padding: 0.75rem;
  border-radius: 0.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
  justify-content: center;
`;

const ControlsWrapper = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 0;
`;

const StyledButton = styled.button`
  padding: 0.6rem 1.2rem;
  color: var(--neutral-900);
  border-radius: 0.375rem;
  box-shadow: 0 1px 3px 0 var(--state-black-20),
    0 1px 2px 0 var(--state-black-20);
  transition: background-color 150ms ease-in-out, opacity 150ms ease-in-out,
    box-shadow 150ms ease-in-out;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;

  background-color: ${(props) =>
    props.$isLastAttempt
      ? "var(--state-red-55)"
      : props.primary
      ? "var(--dark-green-400)"
      : "var(--orange-700)"};

  &:hover:not(:disabled) {
    background-color: ${(props) =>
      props.$isLastAttempt
        ? "var(--feedback-red-hover)"
        : props.primary
        ? "var(--dark-green-500)"
        : "var(--orange-800)"};
  }
  &:focus-visible {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px
      ${(props) =>
        props.$isLastAttempt
          ? "var(--state-red-60)"
          : props.primary
          ? "var(--state-dark-green-60)"
          : "var(--state-orange-60)"};
  }
  &:disabled {
    opacity: var(--button-disabled-opacity);
    cursor: not-allowed;
    &:hover {
      background-color: ${(props) =>
        props.$isLastAttempt
          ? "var(--state-red-55)"
          : props.primary
          ? "var(--dark-green-400)"
          : "var(--orange-700)"};
    }
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
`;

const HowItWorksButton = styled(StyledButton).attrs({ as: "button" })`
  display: inline-block;
  background: var(--state-white-05);
  color: var(--state-white-25);
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  align-self: center;
  box-shadow: none;

  &:hover:not(:disabled) {
    background: var(--state-white-10);
  }
  &:active:not(:disabled) {
    transform: none;
    box-shadow: none;
  }
`;

const Message = styled(motion.div)`
  margin-bottom: 1rem;
  padding: 1rem;
  text-align: center;
  border-radius: 0.5rem;
  border-width: 1px;
  border-style: solid;
  box-shadow: 0 1px 3px 0 var(--state-black-20),
    0 1px 2px 0 var(--state-black-20);
  font-size: 1rem;
  font-weight: 500;
  background-color: ${(props) =>
    props.type === "won" ? "var(--dark-green-800)" : "var(--message-lost-bg)"};
  color: ${(props) =>
    props.type === "won"
      ? "var(--dark-green-200)"
      : "var(--message-lost-text)"};
  border-color: ${(props) =>
    props.type === "won" ? "var(--dark-green-500)" : "var(--state-red-55)"};
`;

const SolutionText = styled.p`
  font-size: 0.8rem;
  margin-top: 0.5rem;
  font-weight: 400;
  color: inherit;
  word-break: keep-all;
`;

const GitHubButton = styled.a`
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem 0.5rem 0.75rem;
  color: var(--state-white-50);
  background-color: var(--state-white-05);
  border-radius: 0.375rem;
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 600;
  transition: background-color 150ms ease-in-out;

  &:hover {
    background-color: var(--state-white-10);
  }

  &:focus-visible {
    outline: 2px solid var(--dark-green-400);
    outline-offset: 2px;
  }
`;

const ModalBackdrop = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--state-black-60);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const ModalContent = styled(motion.div)`
  display: flex;
  background-color: var(--dark-green-800);
  color: var(--neutral-100);
  border-radius: 0.5rem;
  box-shadow: 0 10px 30px var(--state-black-30);
  max-width: 90vw;
  width: 500px;
  max-height: 85vh;
  overflow-y: hidden;
  position: relative;

  @media (max-width: 700px) {
    width: 90vw;
  }
`;

const ModalTitle = styled.div`
  position: static;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--state-white-10);
  padding-bottom: 1rem;
  margin-bottom: 1rem;

  font-size: 1.4rem;
  font-weight: 600;
  color: var(--neutral-100);
`;

const ModalScrollContainer = styled.div`
  flex: 1;
  overflow: auto;
  padding: 2rem;

  @media (max-width: 700px) {
    padding: 2rem;
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  letter-spacing: 0;

  background: none;
  border: none;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 2rem;
  color: var(--state-white-50);
  cursor: pointer;
  border-radius: 50%;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: var(--dark-green-700);
    color: var(--neutral-100);
  }
  &:focus-visible {
    outline: 2px solid var(--dark-green-400);
    outline-offset: 1px;
  }
`;

const ModalBody = styled.div`
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--neutral-200);

  & p {
    margin-bottom: 1rem;
  }
`;

export default App;
