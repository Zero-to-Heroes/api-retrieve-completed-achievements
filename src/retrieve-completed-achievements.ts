import { Rds } from './db/rds';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	try {
		const rds = await Rds.getInstance();
		console.log('input', JSON.stringify(event));
		const userInfo = JSON.parse(event.body);
		console.log('getting stats for user', userInfo);
		const uniqueIdentifiers = await rds.runQuery<readonly any[]>(
			`
			SELECT DISTINCT userName, userId, userMachineId 
			FROM achievement_stat
			WHERE userName = '${userInfo.userName || '__invalid__'}' 
				OR userId = '${userInfo.userId || '__invalid__'}' 
				OR userMachineId = '${userInfo.machineId || '__invalid__'}'
		`,
		);
		console.log('unique identifiers', uniqueIdentifiers);
		const userNamesCondition = uniqueIdentifiers.map(id => "'" + id.userName + "'").join(',');
		const userIdCondition = uniqueIdentifiers.map(id => "'" + id.userId + "'").join(',');
		const machineIdCondition = uniqueIdentifiers.map(id => "'" + id.userMachineId + "'").join(',');
		const allAchievements = await rds.runQuery<readonly any[]>(
			`
			SELECT achievementId, max(numberOfCompletions) AS numberOfCompletions 
			FROM achievement_stat
			WHERE userName in (${userNamesCondition})
				OR userId in (${userIdCondition})
				OR userMachineId in (${machineIdCondition})
			GROUP BY achievementId
			ORDER BY achievementId
		`,
		);
		console.log('allAchievements', allAchievements);
		const results: readonly CompletedAchievement[] = allAchievements.map(result =>
			Object.assign(new CompletedAchievement(), {
				id: result.achievementId,
				numberOfCompletions: result.numberOfCompletions,
			} as CompletedAchievement),
		);
		console.log('results', results);
		const response = {
			statusCode: 200,
			isBase64Encoded: false,
			body: JSON.stringify({ results }),
		};
		console.log('sending back success reponse');
		return response;
	} catch (e) {
		console.error('issue retrieving stats', e);
		const response = {
			statusCode: 500,
			isBase64Encoded: false,
			body: JSON.stringify({ message: 'not ok', exception: e }),
		};
		console.log('sending back error reponse', response);
		return response;
	}
};

class CompletedAchievement {
	readonly id: string;
	readonly numberOfCompletions: number;
}
