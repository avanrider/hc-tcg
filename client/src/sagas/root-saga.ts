import {take, fork, call, put, race, cancel} from 'redux-saga/effects'
import {SagaIterator, Task} from 'redux-saga'
import slotSaga from './slot-saga'
import socketSaga, {receiveMsg, sendMsg} from './socket-saga'
import gameStateSaga from './game-state-saga'
import attackSaga from './attack-saga'

function* actionSaga(actionTask: Task | null): SagaIterator {
	const turnAction = yield race({
		playCard: take('PLAY_CARD'),
		applyEffect: take('APPLY_EFFECT'),
		followUp: take('FOLLOW_UP'),
		attack: take('ATTACK'),
		endTurn: take('END_TURN'),
		changeActiveHermit: take('CHANGE_ACTIVE_HERMIT'),
	})

	// TODO - consider what is being send to backend and in which format
	if (turnAction.playCard) {
		yield call(sendMsg, 'PLAY_CARD', turnAction.playCard.payload)
	} else if (turnAction.applyEffect) {
		yield call(sendMsg, 'APPLY_EFFECT', turnAction.applyEffect.payload)
	} else if (turnAction.followUp) {
		yield call(sendMsg, 'FOLLOW_UP', turnAction.followUp.payload)
	} else if (turnAction.attack) {
		const result = yield call(attackSaga, turnAction.attack)
		yield call(sendMsg, 'ATTACK', result)
	} else if (turnAction.endTurn) {
		yield call(sendMsg, 'END_TURN')
	} else if (turnAction.changeActiveHermit) {
		yield call(
			sendMsg,
			'CHANGE_ACTIVE_HERMIT',
			turnAction.changeActiveHermit.payload
		)
	}

	if (actionTask) yield cancel(actionTask)
}

function* gameSaga(): SagaIterator {
	let slotTask = null
	let actionTask = null
	while (true) {
		const gameAction = yield race({
			gameState: call(receiveMsg, 'GAME_STATE'),
			gameEnd: call(receiveMsg, 'GAME_END'),
		})

		if (actionTask) yield cancel(actionTask)
		if (actionTask) yield cancel(actionTask)

		if (gameAction.gameEnd) {
			yield put({type: 'GAME_END'})
			break
		}

		const {payload} = gameAction.gameState

		yield put({type: 'GAME_STATE', ...payload})

		if (payload.availableActions.includes('WAIT_FOR_TURN')) continue
		if (payload.availableActions.includes('WAIT_FOR_OPPONENT_FOLLOWUP'))
			continue

		slotTask = yield fork(slotSaga)
		yield fork(gameStateSaga, payload.gameState)

		actionTask = yield fork(actionSaga, actionTask)
	}
	yield cancel()
}

function* rootSaga(): SagaIterator {
	const {playerName} = yield take('SET_NAME')
	yield call(socketSaga, playerName)
	const {playerId, playerSecret} = yield call(receiveMsg, 'PLAYER_INFO')
	yield put({type: 'SET_PLAYER_INFO', playerId, playerSecret})
	while (true) {
		const {gameType} = yield take('SET_GAME_TYPE')
		// TODO
		if (gameType !== 'stranger')
			throw new Error('Friend matchmaking not yet supported')

		yield call(sendMsg, 'JOIN_GAME')
		yield call(gameSaga)
	}
}

export default rootSaga
