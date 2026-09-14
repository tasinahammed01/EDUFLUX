import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { env } from "./env.js";

export interface VerifiedFirebaseIdentity {
  uid:string;email?:string;name?:string;picture?:string;email_verified?:boolean;
  auth_time:number;firebase?:{sign_in_provider?:string};
}
export interface FirebaseAuthGateway {
  verifyIdToken(token:string):Promise<VerifiedFirebaseIdentity>;
  createSessionCookie(token:string,expiresIn:number):Promise<string>;
  verifySessionCookie(cookie:string,checkRevoked:boolean):Promise<VerifiedFirebaseIdentity>;
  revokeRefreshTokens(uid:string):Promise<void>;
}

function realGateway():FirebaseAuthGateway{
 const credential=env.FIREBASE_CLIENT_EMAIL&&env.FIREBASE_PRIVATE_KEY
  ?cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n")})
  :applicationDefault();
 const app=getApps()[0]??initializeApp({credential,projectId:env.FIREBASE_PROJECT_ID});
 const auth=getAuth(app);
 return {
  verifyIdToken:token=>auth.verifyIdToken(token,true),
  createSessionCookie:(token,expiresIn)=>auth.createSessionCookie(token,{expiresIn}),
  verifySessionCookie:(cookie,checkRevoked)=>auth.verifySessionCookie(cookie,checkRevoked),
  revokeRefreshTokens:uid=>auth.revokeRefreshTokens(uid)
 };
}

function decodeTestValue(value:string,prefix:string):VerifiedFirebaseIdentity{
 if(!value.startsWith(prefix))throw new Error("Invalid test Firebase credential");
 return JSON.parse(Buffer.from(value.slice(prefix.length),"base64url").toString("utf8")) as VerifiedFirebaseIdentity;
}
const revokedTestUsers=new Set<string>();
const testGateway:FirebaseAuthGateway={
 verifyIdToken:async token=>decodeTestValue(token,"test-id."),
 createSessionCookie:async token=>`test-session.${token.slice("test-id.".length)}`,
 verifySessionCookie:async(cookie,checkRevoked)=>{const identity=decodeTestValue(cookie,"test-session.");if(checkRevoked&&revokedTestUsers.has(identity.uid))throw new Error("revoked");return identity},
 revokeRefreshTokens:async uid=>{revokedTestUsers.add(uid)}
};
export const firebaseAuth:FirebaseAuthGateway=env.NODE_ENV==="test"?testGateway:realGateway();
export function isFirebaseAdminReady():boolean{return env.NODE_ENV==="test"||getApps().length>0}
