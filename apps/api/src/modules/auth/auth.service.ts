import type {PrimaryPersona} from "@eduflux/shared-types";
import {firebaseAuth,type VerifiedFirebaseIdentity} from "../../config/firebase-admin.js";
import {ApiError,isDuplicateKeyError} from "../../utils/api-error.js";
import {mapUserToPublicUser} from "../users/user.mapper.js";
import {upsertFirebaseUser} from "../users/user.repository.js";
import {env} from "../../config/env.js";
const RECENT_AUTH_SECONDS=5*60;
function validateIdentity(identity:VerifiedFirebaseIdentity){if(!identity.uid||!identity.email||!Number.isFinite(identity.auth_time))throw new ApiError(401,"FIREBASE_TOKEN_INVALID","The Firebase identity is invalid.");if(identity.auth_time<Math.floor(Date.now()/1000)-RECENT_AUTH_SECONDS)throw new ApiError(401,"AUTH_RECENT_REQUIRED","Please sign in again before starting a session.")}
export async function exchangeFirebaseToken(idToken:string,primaryPersona?:PrimaryPersona){
 let identity:VerifiedFirebaseIdentity;try{identity=await firebaseAuth.verifyIdToken(idToken)}catch{throw new ApiError(401,"FIREBASE_TOKEN_INVALID","The Firebase sign-in could not be verified.")}
 validateIdentity(identity);
 try{const user=await upsertFirebaseUser(identity,primaryPersona);if(user.status!=="ACTIVE")throw new ApiError(403,"ACCOUNT_DISABLED","This account is not available.");const sessionCookie=await firebaseAuth.createSessionCookie(idToken,env.FIREBASE_SESSION_TTL_DAYS*86_400_000);return{sessionCookie,user:mapUserToPublicUser(user),requiresOnboarding:!user.primaryPersona}}catch(error){if(error instanceof ApiError)throw error;if(isDuplicateKeyError(error))throw new ApiError(409,"EMAIL_ALREADY_REGISTERED","This email is linked to another account.");throw error}
}
export async function revokeAll(firebaseUid:string){await firebaseAuth.revokeRefreshTokens(firebaseUid)}
