import mongoose,{type Model,type Types} from "mongoose";
const {Schema,model,models}=mongoose;
export interface UserRecord{
 _id:Types.ObjectId;firebaseUid:string;email:string;emailCanonical:string;displayName:string;photoURL?:string;
 authProviders:string[];primaryPersona?:"TEACHER"|"STUDENT";platformRole:"USER"|"ADMIN"|"SUPER_ADMIN";
 status:"ACTIVE"|"SUSPENDED"|"DISABLED";emailVerified:boolean;lastLoginAt?:Date;createdAt:Date;updatedAt:Date;
}
const userSchema=new Schema<UserRecord>({
 firebaseUid:{type:String,required:true,maxlength:128},
 email:{type:String,required:true,maxlength:254},emailCanonical:{type:String,required:true,maxlength:254,select:false},
 displayName:{type:String,required:true,minlength:1,maxlength:80},photoURL:{type:String,maxlength:2048},
 authProviders:{type:[String],required:true,default:[]},
 primaryPersona:{type:String,enum:["TEACHER","STUDENT"]},
 platformRole:{type:String,enum:["USER","ADMIN","SUPER_ADMIN"],required:true,default:"USER"},
 status:{type:String,enum:["ACTIVE","SUSPENDED","DISABLED"],required:true,default:"ACTIVE"},
 emailVerified:{type:Boolean,required:true,default:false},lastLoginAt:Date
},{timestamps:true,versionKey:false});
userSchema.index({firebaseUid:1},{unique:true,name:"user_firebase_uid_unique"});
userSchema.index({emailCanonical:1},{unique:true,name:"user_email_canonical_unique"});
export const UserModel=(models.User as Model<UserRecord>|undefined)??model<UserRecord>("User",userSchema);
