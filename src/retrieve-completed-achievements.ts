/* eslint-disable @typescript-eslint/no-use-before-define */
import SqlString from 'sqlstring';
import { gzipSync } from 'zlib';
import db from './db/rds';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	try {
		const mysql = await db.getConnection();
		console.log('input', JSON.stringify(event));
		const escape = SqlString.escape;
		const userInfo = JSON.parse(event.body);
		console.log('getting stats for user', userInfo);
		const debug = userInfo.userName === 'daedin';
		const uniqueIdentifiersQuery = `
			SELECT DISTINCT userName, userId 
			FROM achievement_stat
			WHERE userName = ${escape(userInfo.userName || '__invalid__')}
				OR userId = ${escape(userInfo.userId || '__invalid__')}
		`;
		if (debug) {
			console.log('debug mode', uniqueIdentifiersQuery);
		}
		const uniqueIdentifiers = await mysql.query(uniqueIdentifiersQuery);
		if (debug) {
			console.log('unique identifiers', uniqueIdentifiers);
		}
		const userNamesCondition = uniqueIdentifiers
			// .filter(id => id.userName)
			.map(id => "'" + id.userName + "'")
			.join(',');
		const userIdCondition = uniqueIdentifiers
			// .filter(id => id.userId)
			.map(id => "'" + id.userId + "'")
			.join(',');
		// const machineIdCondition = uniqueIdentifiers
		// 	// .filter(id => id.userMachineId)
		// 	.map(id => "'" + id.userMachineId + "'")
		// 	.join(',');
		if (isEmpty(userNamesCondition) || isEmpty(userIdCondition)) {
			return {
				statusCode: 200,
				isBase64Encoded: false,
				body: JSON.stringify({ results: [] }),
			};
		}
		const query = `
			SELECT achievementId, max(numberOfCompletions) AS numberOfCompletions 
			FROM achievement_stat
			WHERE userName in (${userNamesCondition}) OR userId in (${userIdCondition})
			GROUP BY achievementId
			ORDER BY achievementId
		`;
		console.log('running query', query);
		if (debug) {
		}
		const allAchievements = await mysql.query(query);
		const results: readonly CompletedAchievement[] = allAchievements.map(result =>
			Object.assign(new CompletedAchievement(), {
				id: result.achievementId,
				numberOfCompletions: result.numberOfCompletions,
			} as CompletedAchievement),
		);
		console.log('results', results.filter(ach => ach.id.indexOf('global_mana_spent_') !== -1));
		if (debug) {
		}
		await mysql.end();
		// console.log('results', results);
		const stringResults = JSON.stringify({ results });
		const gzippedResults = gzipSync(stringResults).toString('base64');
		console.log('compressed', stringResults.length, gzippedResults.length);
		const response = {
			statusCode: 200,
			isBase64Encoded: true,
			body: gzippedResults,
			headers: {
				'Content-Type': 'text/html',
				'Content-Encoding': 'gzip',
			},
		};
		// console.log('sending back success reponse');
		return response;
	} catch (e) {
		console.error('issue retrieving stats', e, event);
		const response = {
			statusCode: 500,
			isBase64Encoded: false,
			body: JSON.stringify({ message: 'not ok', exception: e.message, error: e.error }),
		};
		console.log('sending back error reponse', response);
		return response;
	}
};

const isEmpty = (input: string) => !input || input.length === 0;

class CompletedAchievement {
	readonly id: string;
	readonly numberOfCompletions: number;
}
