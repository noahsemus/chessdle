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
// Use transient props ($isLastAttempt, $isGameOver)
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
// Use transient prop ($feedbackType)
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

// --- Helper Functions ---
const parseSanMove = (fenBeforeMove, san) => {
  console.log(
    `  [parseSanMove] Attempting to parse SAN "${san}" from FEN "${fenBeforeMove}"`
  );
  const tempGame = new Chess(fenBeforeMove);
  let moveDetails = null;
  try {
    // Use stricter parsing (no sloppy)
    moveDetails = tempGame.move(san);
    console.log(
      `  [parseSanMove] chess.js move() result for "${san}":`,
      moveDetails
    );
    if (!moveDetails) {
      console.log(
        `  [parseSanMove] Move "${san}" is illegal or wrong turn -> returning null.`
      );
      return null;
    }
    return {
      piece: moveDetails.piece,
      from: moveDetails.from,
      to: moveDetails.to,
      san: moveDetails.san,
      color: moveDetails.color,
      promotion: moveDetails.promotion,
    };
  } catch (e) {
    console.error(
      `  [parseSanMove] Exception parsing SAN "${san}" from FEN "${fenBeforeMove}":`,
      e
    );
    return null;
  }
};
const parseUci = (uci) => {
  if (!uci || uci.length < 4 || uci.length > 5) {
    console.warn("Invalid UCI string format:", uci);
    return null;
  }
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  const promotion =
    uci.length === 5 ? uci.substring(4, 5).toLowerCase() : undefined;
  const validSquare = /^[a-h][1-8]$/;
  if (!validSquare.test(from) || !validSquare.test(to)) {
    console.warn("Invalid squares in UCI string:", uci);
    return null;
  }
  if (promotion && !/^[qrbn]$/.test(promotion)) {
    console.warn("Invalid promotion piece in UCI string:", uci);
    return null;
  }
  return { from, to, promotion };
};

// --- Feedback Display Component ---
function FeedbackDisplay({ userSequence, feedback }) {
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
    <FeedbackList>
      {userSequence.map((move, index) => (
        // Pass transient prop $feedbackType
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
  // State variables...
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [currentFen, setCurrentFen] = useState("start");
  const [userMoveSequence, setUserMoveSequence] = useState([]);
  const [attemptsHistory, setAttemptsHistory] = useState([]);
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState(1);
  const [gameState, setGameState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Fetch Puzzle Data... (useEffect remains the same)
  useEffect(() => {
    const fetchDailyPuzzle = async () => {
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
      console.log("Attempting to fetch from:", targetUrl);
      try {
        const response = await fetch(targetUrl);
        if (!response.ok) {
          let errorBody = `HTTP error ${response.status} (${response.statusText})`;
          try {
            errorBody = await response.text();
          } catch (textError) {
            /* Ignore */
          }
          console.error("Fetch error body:", errorBody);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Lichess Puzzle Data Received:", data);
        let baseFen = data?.game?.fen;
        const pgn = data?.game?.pgn;
        const initialPly = data?.puzzle?.initialPly;
        const solution = data?.puzzle?.solution;
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
            const nextMoveIndex = initialPly;
            if (history[nextMoveIndex]) {
              const extraMoveResult = tempChess.move(history[nextMoveIndex]);
              if (!extraMoveResult) console.warn(`Could not apply extra move`);
            } else {
              console.warn(`No move at index ${nextMoveIndex}`);
            }
            baseFen = tempChess.fen();
            console.log("Using derived base FEN:", baseFen);
          } catch (pgnError) {
            throw new Error(`Failed to derive FEN: ${pgnError.message}`);
          }
        }
        if (!baseFen || !solution || solution.length === 0) {
          throw new Error("Incomplete puzzle data");
        }
        try {
          new Chess(baseFen);
        } catch (fenValidationError) {
          throw new Error(`Initial FEN invalid: ${fenValidationError.message}`);
        }
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
          const tempGameForTurnCheck = new Chess(baseFen);
          if (tempGameForTurnCheck.move(parsedFirstMove) !== null)
            turnSeemsCorrect = true;
        } catch (turnCheckError) {
          /* Assume wrong turn */
        }
        if (!turnSeemsCorrect) {
          const fenParts = baseFen.split(" ");
          if (fenParts.length >= 2) {
            const currentTurn = fenParts[1];
            const newTurn = currentTurn === "w" ? "b" : "w";
            fenParts[1] = newTurn;
            const flippedFen = fenParts.join(" ");
            try {
              const tempGameAfterFlip = new Chess(flippedFen);
              if (tempGameAfterFlip.move(parsedFirstMove) !== null)
                correctedFen = flippedFen;
              else console.error(`Move still invalid after flip`);
            } catch (flipCheckError) {
              console.error(`Error checking flipped FEN:`, flipCheckError);
            }
          } else {
            console.error("Could not parse base FEN to flip");
          }
        }
        let finalInitialFen = correctedFen;
        let chessInstance;
        try {
          chessInstance = new Chess(finalInitialFen);
        } catch (fenError) {
          throw new Error(`Invalid final FEN: ${fenError.message}`);
        }
        setPuzzle({
          id: data.puzzle.id || "unknown",
          rating: data.puzzle.rating || "N/A",
          initialFen: finalInitialFen,
          solution: solution,
          playerColor:
            finalInitialFen.split(" ")[1] === "w" ? "white" : "black",
        });
        setGame(chessInstance);
        setCurrentFen(finalInitialFen);
        setGameState("playing");
        console.log("Puzzle loaded.");
      } catch (err) {
        console.error("Fetch/process error:", err);
        setErrorMessage(`Load failed: ${err.message}. Check console.`);
        setGameState("error");
      }
    };
    fetchDailyPuzzle();
  }, []);

  // Handle User Moves... (onDrop remains the same)
  const onDrop = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (gameState !== "playing" || !game) {
        return false;
      }
      const gameCopy = new Chess(currentFen);
      let moveResult = null;
      try {
        moveResult = gameCopy.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch (error) {
        console.error("Error attempting move:", error);
        return false;
      }
      if (moveResult === null) {
        console.log("Invalid move attempted:", sourceSquare, targetSquare);
        return false;
      }
      setCurrentFen(gameCopy.fen());
      const newSequence = [...userMoveSequence, moveResult.san];
      setUserMoveSequence(newSequence);
      console.log("User move added (SAN):", moveResult.san);
      return true;
    },
    [game, currentFen, userMoveSequence, gameState]
  );

  // Reset User Input... (handleResetInput remains the same)
  const handleResetInput = () => {
    if (!puzzle || !game || gameState !== "playing") {
      return;
    }
    try {
      setCurrentFen(puzzle.initialFen);
      setUserMoveSequence([]);
      console.log("Current attempt input reset.");
    } catch (err) {
      console.error("Error during input reset:", err);
      setErrorMessage("Error resetting input.");
    }
  };

  // --- Submit and Validate Sequence ---
  const handleSubmit = () => {
    if (
      !puzzle ||
      !game ||
      !puzzle.solution ||
      userMoveSequence.length === 0 ||
      gameState !== "playing"
    ) {
      return;
    }
    console.log(
      `Submitting Attempt ${currentAttemptNumber} (User SAN):`,
      userMoveSequence
    );
    console.log("Comparing with solution (UCI):", puzzle.solution);
    const solutionMovesUci = puzzle.solution;
    const feedbackResults = [];
    let allCorrect = true;
    let validationGame;
    try {
      if (!puzzle.initialFen) throw new Error("Initial FEN missing");
      validationGame = new Chess(puzzle.initialFen);
    } catch (err) {
      console.error("Validation instance error:", err);
      setErrorMessage("Internal error: Could not initialize validation.");
      setGameState("error");
      return;
    }
    const comparisonLength = Math.max(
      userMoveSequence.length,
      solutionMovesUci.length
    );

    console.log(
      `\n--- Starting Validation for Attempt ${currentAttemptNumber} ---`
    );

    for (let i = 0; i < comparisonLength; i++) {
      const currentValidationFen = validationGame.fen();
      const userSan = userMoveSequence[i];
      const solutionUci = solutionMovesUci[i];
      let result = "red";
      let advanceStateSuccess = true;

      console.log(`\n[Index ${i}]`);
      console.log(`  FEN: ${currentValidationFen}`);
      console.log(`  User SAN: ${userSan || "N/A"}`);
      console.log(`  Solution UCI: ${solutionUci || "N/A"}`);

      const userMoveObject = userSan
        ? parseSanMove(currentValidationFen, userSan)
        : null;
      const solutionMoveObject = solutionUci ? parseUci(solutionUci) : null;

      console.log(`  Parsed User Move (SAN -> obj):`, userMoveObject);
      console.log(`  Parsed Solution Move (UCI -> obj):`, solutionMoveObject);

      // Calculate Feedback
      if (userMoveObject && solutionMoveObject) {
        // --- Green Check ---
        const isGreen =
          userMoveObject.from === solutionMoveObject.from &&
          userMoveObject.to === solutionMoveObject.to &&
          userMoveObject.promotion === solutionMoveObject.promotion;
        console.log(`  isGreen Check: ${isGreen}`);
        if (isGreen) {
          result = "green";
        } else {
          // --- Yellow Check (Standard) ---
          const pieceMatch = userMoveObject.from === solutionMoveObject.from; // Correct piece instance?
          const destMatch = userMoveObject.to === solutionMoveObject.to; // Correct destination square?
          console.log(
            `  pieceMatch (from squares): ${pieceMatch} (${userMoveObject.from} vs ${solutionMoveObject.from})`
          );
          console.log(
            `  destMatch (to squares): ${destMatch} (${userMoveObject.to} vs ${solutionMoveObject.to})`
          );
          if ((pieceMatch || destMatch) && !(pieceMatch && destMatch)) {
            // XOR logic
            result = "yellow";
          }
          // If not Green or Yellow, result remains 'red'
        }
      } else {
        // --- Handle Parsing Failure ---
        result = "red";
        console.log(
          `  Parsing failed or sequence length mismatch -> Defaulting to Red.`
        );
        // *** MODIFICATION: Check for Yellow override if user parse failed ***
        if (userSan && !userMoveObject && solutionMoveObject) {
          console.log(
            `  Reason: Could not parse user SAN "${userSan}". Checking for destination match override...`
          );
          // Attempt to extract destination from SAN using regex
          const sanDestMatch = userSan.match(/([a-h][1-8])\+?#?$/);
          const userIntendedDest = sanDestMatch ? sanDestMatch[1] : null;

          if (userIntendedDest) {
            console.log(
              `  Extracted intended destination from user SAN: "${userIntendedDest}"`
            );
            if (userIntendedDest === solutionMoveObject.to) {
              console.log(
                `  Destination match FOUND ("${userIntendedDest}" === "${solutionMoveObject.to}"). Overriding result to YELLOW.`
              );
              result = "yellow"; // Override to Yellow based on destination match
            } else {
              console.log(
                `  Destination match NOT found ("${userIntendedDest}" !== "${solutionMoveObject.to}"). Result remains RED.`
              );
            }
          } else {
            console.log(
              `  Could not extract destination from user SAN "${userSan}". Result remains RED.`
            );
          }
        } else if (!userSan && solutionUci) {
          console.log(`  Reason: User sequence ended early.`);
        } else if (!solutionUci && userSan) {
          console.log(`  Reason: Solution sequence ended early.`);
        } else if (solutionUci && !solutionMoveObject) {
          console.log(
            `  Reason: Could not parse solution UCI "${solutionUci}".`
          );
        }
        // *** MODIFICATION END ***
      }

      console.log(`  => Result for index ${i}: ${result.toUpperCase()}`);
      feedbackResults.push(result);
      if (result !== "green") {
        allCorrect = false;
      }

      // Advance validation board state using the CORRECT solution move
      if (solutionUci) {
        let moveApplied = null;
        try {
          console.log(
            `  Advancing validation state with solution UCI: ${solutionUci}`
          );
          moveApplied = validationGame.move(solutionUci); // Use UCI string
          if (!moveApplied) {
            console.warn(
              `  Solution move ${i} returned null (illegal). Validation state may be incorrect.`
            );
            advanceStateSuccess = false;
            if (result !== "red") {
              feedbackResults[feedbackResults.length - 1] = "red";
              allCorrect = false;
            }
            break; // Exit the loop
          } else {
            console.log(`  State advanced. New FEN: ${validationGame.fen()}`);
          }
        } catch (e) {
          console.warn(
            `  Solution move ${i} exception: ${e.message}. Validation state may be incorrect.`
          );
          advanceStateSuccess = false;
          if (result !== "red") {
            feedbackResults[feedbackResults.length - 1] = "red";
            allCorrect = false;
          }
          break; // Exit the loop
        }
      } else if (i < solutionMovesUci.length) {
        console.error(`Solution UCI missing at index ${i}`);
        setErrorMessage("Internal error: Missing solution data.");
        setGameState("error");
        return;
      } else {
        advanceStateSuccess = false;
      }
    } // End of validation loop

    while (feedbackResults.length < userMoveSequence.length) {
      console.warn(`User sequence longer than processed validation steps.`);
      feedbackResults.push("red");
      allCorrect = false;
    }
    console.log(
      `--- Validation Complete for Attempt ${currentAttemptNumber} ---`
    );
    console.log("Final Feedback Results:", feedbackResults);
    console.log("Overall Correct:", allCorrect);
    const newAttempt = {
      sequence: userMoveSequence,
      feedback: feedbackResults,
    };
    const updatedHistory = [...attemptsHistory, newAttempt];
    setAttemptsHistory(updatedHistory);
    if (allCorrect) {
      setGameState("won");
      console.log(`Game Won!`);
    } else if (currentAttemptNumber >= MAX_ATTEMPTS) {
      setGameState("lost");
      console.log(`Game Lost.`);
    } else {
      setGameState("playing");
      setCurrentAttemptNumber(currentAttemptNumber + 1);
      setUserMoveSequence([]);
      if (puzzle) {
        setCurrentFen(puzzle.initialFen);
      }
      console.log(
        `Incorrect. Proceeding to attempt ${currentAttemptNumber + 1}.`
      );
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
          <HistoryContainer>
            {attemptsHistory.map((attempt, index) => (
              // Pass transient props ($isLastAttempt, $isGameOver)
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
                {" "}
                <CurrentSequenceLabel>
                  Current sequence ({userMoveSequence.length}/
                  {puzzle.solution.length} moves):
                </CurrentSequenceLabel>{" "}
                <CurrentSequenceMoves>
                  {userMoveSequence.join(" ") || "(No moves entered yet)"}
                </CurrentSequenceMoves>{" "}
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

export default App;
