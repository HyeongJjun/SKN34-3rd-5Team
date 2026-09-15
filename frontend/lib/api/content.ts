import type { components } from "./schema";

type Schemas = components["schemas"];

export type CourseDto = Schemas["Course"];
export type CourseCreateRequestDto = Schemas["CourseCreateRequest"];
export type CoursePatchRequestDto = Schemas["PatchedCoursePatchRequest"];
export type CourseCreateResultDto = Schemas["CourseCreateResult"];
export type CourseReactionRequestDto = Schemas["CourseReactionRequest"];
export type CourseReactionDto = Schemas["CourseReaction"];
export type CourseViewResultDto = Schemas["CourseViewResult"];
export type CommunityPostWriteDto = Schemas["CommunityPostWrite"];
export type CommunityPostPatchDto = Schemas["PatchedCommunityPostPatch"];
export type CommunityPostDto = Schemas["CommunityPost"];
export type CommunityCommentWriteDto = Schemas["CommunityCommentWrite"];
export type CommunityCommentDto = Schemas["CommunityComment"];
export type CommunityVoteWriteDto = Schemas["CommunityVoteWrite"];
export type CommunityVoteStateDto = Schemas["CommunityVoteState"];
export type CommunityReportWriteDto = Schemas["CommunityReportWrite"];
export type CommunityReportResultDto = Schemas["CommunityReportResult"];
export type PredictionChoiceWriteDto = Schemas["PredictionChoiceWrite"];
export type PredictionTeamDto = Schemas["PredictionTeam"];
export type PredictionVotesDto = Schemas["PredictionVotes"];
export type PredictionGameDto = Schemas["PredictionGame"];
