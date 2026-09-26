import type {PrimaryPersona} from "@eduflux/shared-types";
import type {VerifiedFirebaseIdentity} from "../../config/firebase-admin.js";
import {UserModel,type UserRecord} from "./user.model.js";
export function canonicalizeEmail(email:string){return email.trim().toLowerCase()}
export async function findActiveUserById(id:string){return UserModel.findOne({_id:id,status:"ACTIVE"}).exec()}
export async function findActiveUserByFirebaseUid(firebaseUid:string){return UserModel.findOne({firebaseUid,status:"ACTIVE"}).exec()}
export async function upsertFirebaseUser(identity:VerifiedFirebaseIdentity,persona?:PrimaryPersona):Promise<UserRecord>{
 if(!identity.email)throw new Error("Verified Firebase account has no email");
 const provider=identity.firebase?.sign_in_provider;
 const update={
  $set:{email:identity.email,emailCanonical:canonicalizeEmail(identity.email),displayName:(identity.name||identity.email.split("@")[0]||"MENTRA user").slice(0,80),emailVerified:Boolean(identity.email_verified),lastLoginAt:new Date(),...(identity.picture?{photoURL:identity.picture}:{})},
  $setOnInsert:{firebaseUid:identity.uid,platformRole:"USER",status:"ACTIVE",authProviders:provider?[provider]:[],...(persona?{primaryPersona:persona}:{})}
 };
 return UserModel.findOneAndUpdate({firebaseUid:identity.uid},update,{upsert:true,returnDocument:"after",runValidators:true,setDefaultsOnInsert:true}).exec();
}
export async function setInitialPersona(userId:string,primaryPersona:PrimaryPersona){return UserModel.findOneAndUpdate({_id:userId,status:"ACTIVE",primaryPersona:{$exists:false}},{$set:{primaryPersona}},{returnDocument:"after"}).exec()}
