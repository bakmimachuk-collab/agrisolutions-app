import React, { useCallback, useEffect, useState } from "react";
import { ImagePlus, MessageCircle, MoreHorizontal, Pencil, Search, Send, ThumbsUp, Trash2, X } from "lucide-react";
import { Localize, useLanguage } from "../i18n.jsx";
import { useAuth } from "./AuthContext.jsx";

const categories=[
  ["crop_farming","Crop farming"],["livestock_farming","Livestock farming"],["soil_management","Soil management"],
  ["pest_disease","Pest and disease management"],["farm_business","Farm business"],
  ["agricultural_technology","Agricultural technology"],["general_questions","General questions"],["success_stories","Success stories"]
];
const PAGE_SIZE=20;
const initials=(name)=>name?.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"F";

export function CommunityPage(){
  const {client,user,configured}=useAuth();
  const {language,t}=useLanguage();
  const locale=language==="ha"?"ha-NG":language==="pcm"?"en-NG":"en-NG";
  const [posts,setPosts]=useState([]);
  const [loading,setLoading]=useState(configured);
  const [error,setError]=useState("");
  const [category,setCategory]=useState("all");
  const [sort,setSort]=useState("latest");
  const [query,setQuery]=useState("");
  const [submittedQuery,setSubmittedQuery]=useState("");
  const [offset,setOffset]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [title,setTitle]=useState("");
  const [content,setContent]=useState("");
  const [postCategory,setPostCategory]=useState("general_questions");
  const [location,setLocation]=useState("");
  const [files,setFiles]=useState([]);
  const [posting,setPosting]=useState(false);
  const [openComments,setOpenComments]=useState({});
  const [comments,setComments]=useState({});
  const [commentDrafts,setCommentDrafts]=useState({});
  const [replyTarget,setReplyTarget]=useState({});
  const [reportTarget,setReportTarget]=useState("");
  const [reportReason,setReportReason]=useState("spam");
  const [reportDescription,setReportDescription]=useState("");
  const [busyAction,setBusyAction]=useState("");
  const [editingPost,setEditingPost]=useState("");
  const [editTitle,setEditTitle]=useState("");
  const [editContent,setEditContent]=useState("");
  const [editingComment,setEditingComment]=useState("");
  const [editCommentText,setEditCommentText]=useState("");
  const [reportingComment,setReportingComment]=useState("");

  const enrichPosts=useCallback(async(rows)=>{
    if(!rows.length)return [];
    const ids=rows.map(row=>row.id);
    const userIds=[...new Set(rows.map(row=>row.user_id))];
    const [statsResult,profileResult,reactionResult]=await Promise.all([
      client.from("community_post_stats").select("post_id,comment_count,helpful_count").in("post_id",ids),
      client.from("community_profiles").select("id,display_name,avatar_url,region").in("id",userIds),
      client.from("community_reactions").select("post_id").eq("user_id",user.id).in("post_id",ids).eq("reaction_type","helpful")
    ]);
    const failed=[statsResult.error,profileResult.error,reactionResult.error].find(Boolean);
    if(failed)throw failed;
    const stats=new Map((statsResult.data||[]).map(item=>[item.post_id,item]));
    const profiles=new Map((profileResult.data||[]).map(item=>[item.id,item]));
    const reacted=new Set((reactionResult.data||[]).map(item=>item.post_id));
    const withImages=await Promise.all(rows.map(async row=>{
      let imageUrls=[];
      if(row.image_urls?.length){
        const signed=await client.storage.from("community-images").createSignedUrls(row.image_urls,3600);
        if(signed.error)throw signed.error;
        imageUrls=(signed.data||[]).map(item=>item.signedUrl).filter(Boolean);
      }
      return {...row,author:profiles.get(row.user_id),stats:stats.get(row.id)||{comment_count:0,helpful_count:0},reacted:reacted.has(row.id),signedImageUrls:imageUrls};
    }));
    return withImages;
  },[client,user?.id]);

  const fetchPosts=useCallback(async(start=0,append=false)=>{
    if(!configured||!user)return;
    setLoading(true);setError("");
    try{
      let rows=[];
      let postError=null;
      let idsInOrder=null;
      if(sort==="popular"){
        const stats=await client.from("community_post_stats").select("post_id,helpful_count")
          .order("helpful_count",{ascending:false}).range(start,start+PAGE_SIZE-1);
        if(stats.error)throw stats.error;
        idsInOrder=(stats.data||[]).map(item=>item.post_id);
        if(idsInOrder.length){
          const result=await client.from("community_posts").select("*").eq("status","published")
            .eq(category==="all"?"status":"category",category==="all"?"published":category)
            .in("id",idsInOrder);
          rows=result.data||[];postError=result.error;
        }
      }else{
        let request=client.from("community_posts").select("*").eq("status","published")
          .order("created_at",{ascending:false}).range(start,start+PAGE_SIZE-1);
        if(category!=="all")request=request.eq("category",category);
        if(submittedQuery){
          const safe=submittedQuery.replace(/[,%()]/g," ").trim().slice(0,100);
          if(safe)request=request.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
        }
        const result=await request;rows=result.data||[];postError=result.error;
      }
      if(postError)throw postError;
      if(idsInOrder){
        const positions=new Map(idsInOrder.map((id,index)=>[id,index]));
        rows.sort((a,b)=>(positions.get(a.id)??0)-(positions.get(b.id)??0));
      }
      const enriched=await enrichPosts(rows);
      setPosts(current=>append?[...current,...enriched]:enriched);
      setHasMore(rows.length===PAGE_SIZE);
      setOffset(start+rows.length);
    }catch(loadError){setError(`Could not load community posts: ${loadError.message}`);}
    finally{setLoading(false);}
  },[category,client,configured,enrichPosts,sort,submittedQuery,user]);

  useEffect(()=>{
    setPosts([]);setOffset(0);fetchPosts(0,false);
    if(!configured)return undefined;
    const channel=client.channel(`community-feed-${user.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"community_posts"},()=>fetchPosts(0,false))
      .on("postgres_changes",{event:"*",schema:"public",table:"community_comments"},()=>fetchPosts(0,false))
      .on("postgres_changes",{event:"*",schema:"public",table:"community_reactions"},()=>fetchPosts(0,false))
      .subscribe();
    return()=>{client.removeChannel(channel);};
  },[client,configured,fetchPosts,user?.id]);

  const submitPost=async(event)=>{
    event.preventDefault();
    if(!title.trim()||!content.trim())return;
    if(files.length>4){setError("You can attach up to four images to a post.");return;}
    setPosting(true);setError("");
    const imagePaths=[];
    try{
      for(const file of files){
        if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024){
          throw new Error("Images must be JPG, PNG, or WebP and no larger than 5 MB each.");
        }
        const path=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g,"_")}`;
        const {error:uploadError}=await client.storage.from("community-images").upload(path,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
        imagePaths.push(path);
      }
      const {error:insertError}=await client.from("community_posts").insert({
        user_id:user.id,title:title.trim(),content:content.trim(),category:postCategory,
        image_urls:imagePaths,location:location.trim()||null
      });
      if(insertError)throw insertError;
      setTitle("");setContent("");setLocation("");setFiles([]);
      await fetchPosts(0,false);
    }catch(postError){
      if(imagePaths.length){
        const {error:cleanupError}=await client.storage.from("community-images").remove(imagePaths);
        if(cleanupError)setError(`Could not publish post: ${postError.message}. Uploaded images also need cleanup: ${cleanupError.message}`);
        else setError(`Could not publish post: ${postError.message}`);
      }else setError(`Could not publish post: ${postError.message}`);
    }
    finally{setPosting(false);}
  };

  const removePost=async(post)=>{
    if(!window.confirm("Delete this post and its discussion?"))return;
    setBusyAction(post.id);setError("");
    const {error:deleteError}=await client.from("community_posts").delete().eq("id",post.id).eq("user_id",user.id);
    if(deleteError)setError(`Could not delete post: ${deleteError.message}`);
    else{
      setPosts(current=>current.filter(item=>item.id!==post.id));
      if(post.image_urls?.length){
        const {error:imageError}=await client.storage.from("community-images").remove(post.image_urls);
        if(imageError)setError(`Post was deleted, but its stored images could not be removed: ${imageError.message}`);
      }
    }
    setBusyAction("");
  };

  const savePostEdit=async(event,post)=>{
    event.preventDefault();
    if(!editTitle.trim()||!editContent.trim())return;
    setBusyAction(post.id);setError("");
    const {error:updateError}=await client.from("community_posts").update({
      title:editTitle.trim(),content:editContent.trim()
    }).eq("id",post.id).eq("user_id",user.id);
    if(updateError)setError(`Could not update post: ${updateError.message}`);
    else{setEditingPost("");await fetchPosts(0,false);}
    setBusyAction("");
  };

  const toggleReaction=async(post)=>{
    setBusyAction(post.id);setError("");
    const result=post.reacted
      ? await client.from("community_reactions").delete().eq("post_id",post.id).eq("user_id",user.id).eq("reaction_type","helpful")
      : await client.from("community_reactions").insert({post_id:post.id,user_id:user.id,reaction_type:"helpful"});
    if(result.error)setError(`Could not update reaction: ${result.error.message}`);
    else await fetchPosts(0,false);
    setBusyAction("");
  };

  const loadComments=async(postId)=>{
    const {data,error:commentError}=await client.from("community_comments").select("*").eq("post_id",postId).order("created_at",{ascending:true}).limit(200);
    if(commentError){setError(`Could not load replies: ${commentError.message}`);return;}
    const ids=[...new Set((data||[]).map(comment=>comment.user_id))];
    const profiles=ids.length?await client.from("community_profiles").select("id,display_name,avatar_url").in("id",ids):{data:[],error:null};
    if(profiles.error){setError(`Could not load reply authors: ${profiles.error.message}`);return;}
    const byId=new Map((profiles.data||[]).map(profile=>[profile.id,profile]));
    setComments(current=>({...current,[postId]:(data||[]).map(comment=>({...comment,author:byId.get(comment.user_id)}))}));
  };

  const toggleComments=async(postId)=>{
    const willOpen=!openComments[postId];
    setOpenComments(current=>({...current,[postId]:willOpen}));
    if(willOpen)await loadComments(postId);
  };

  const submitComment=async(event,postId)=>{
    event.preventDefault();
    const text=commentDrafts[postId]?.trim();
    if(!text)return;
    setBusyAction(`comment-${postId}`);setError("");
    const {error:insertError}=await client.from("community_comments").insert({
      post_id:postId,user_id:user.id,parent_comment_id:replyTarget[postId]||null,content:text
    });
    if(insertError)setError(`Could not post reply: ${insertError.message}`);
    else{
      setCommentDrafts(current=>({...current,[postId]:""}));
      setReplyTarget(current=>({...current,[postId]:null}));
      await loadComments(postId);await fetchPosts(0,false);
    }
    setBusyAction("");
  };

  const deleteComment=async(comment,postId)=>{
    if(!window.confirm("Delete this reply?"))return;
    const {error:deleteError}=await client.from("community_comments").delete().eq("id",comment.id).eq("user_id",user.id);
    if(deleteError)setError(`Could not delete reply: ${deleteError.message}`);
    else{await loadComments(postId);await fetchPosts(0,false);}
  };

  const saveCommentEdit=async(event,comment,postId)=>{
    event.preventDefault();
    if(!editCommentText.trim())return;
    const {error:updateError}=await client.from("community_comments").update({content:editCommentText.trim()})
      .eq("id",comment.id).eq("user_id",user.id);
    if(updateError)setError(`Could not update reply: ${updateError.message}`);
    else{setEditingComment("");await loadComments(postId);}
  };

  const submitCommentReport=async(event,comment,postId)=>{
    event.preventDefault();setBusyAction(`report-comment-${comment.id}`);setError("");
    const {error:reportError}=await client.from("community_reports").insert({
      reporter_id:user.id,comment_id:comment.id,reason:reportReason,description:reportDescription.trim()
    });
    if(reportError)setError(`Could not submit report: ${reportError.message}`);
    else{setReportingComment("");setReportDescription("");}
    setBusyAction("");
  };

  const submitReport=async(event)=>{
    event.preventDefault();
    setBusyAction(`report-${reportTarget}`);setError("");
    const {error:reportError}=await client.from("community_reports").insert({
      reporter_id:user.id,post_id:reportTarget,reason:reportReason,description:reportDescription.trim()
    });
    if(reportError)setError(`Could not submit report: ${reportError.message}`);
    else{setReportTarget("");setReportDescription("");}
    setBusyAction("");
  };

  const searchSubmit=(event)=>{event.preventDefault();setSubmittedQuery(query.trim());};

  if(!configured)return <Localize><div className="community-page"><div className="page-title"><div><div className="eyebrow">COMMUNITY</div><h1>Agriculture community</h1><p>Discuss farming with other AgriPlus users.</p></div></div><div className="card community-unavailable"><MessageCircle size={30}/><h2>Community requires a connected account</h2><p>Configure Supabase and sign in to view or publish real community posts. Sample posts are intentionally not shown.</p></div></div></Localize>;

  return <Localize><div className="community-page">
    <div className="page-title"><div><div className="eyebrow">COMMUNITY</div><h1>Agriculture community</h1><p>Share practical experience and learn from other farmers.</p></div></div>
    {error&&<div className="auth-message error" role="alert">{error}</div>}
    <form className="card community-compose" onSubmit={submitPost}>
      <label>Post title<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What would you like to discuss?"/></label>
      <label>Your post<textarea required maxLength={10000} value={content} onChange={e=>setContent(e.target.value)} placeholder="Share a question or useful farm experience…"/></label>
      <div className="community-compose-controls"><label>Category<select value={postCategory} onChange={e=>setPostCategory(e.target.value)}>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Location (optional)<input maxLength={150} value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Jos, Plateau State"/></label><label className="community-image-select"><ImagePlus size={16}/> Add images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setFiles([...e.target.files])}/></label><button className="primary" disabled={posting}>{posting?"Publishing…":"Publish post"}</button></div>
      {files.length>0&&<div className="community-file-list">{files.map(file=><span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
    </form>

    <div className="community-toolbar"><form className="community-search" onSubmit={searchSubmit}><Search size={16}/><input aria-label="Search community posts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search posts"/><button className="outline">Search</button></form><select aria-label="Filter community category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select aria-label="Sort community posts" value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">Latest</option><option value="popular">Most helpful</option></select></div>
    <div className="community-post-list">
      {loading&&posts.length===0?<div className="card community-empty">Loading community posts…</div>:posts.length===0?<div className="card community-empty"><MessageCircle size={28}/><strong>No posts found</strong><span>Start a discussion or change the search and category filters.</span></div>:posts.map(post=><article className="card community-post" key={post.id}>
        <div className="community-post-author"><div className="post-avatar">{post.author?.avatar_url?<img src={post.author.avatar_url} alt=""/>:initials(post.author?.display_name)}</div><div><strong>{post.author?.display_name||"AgriPlus farmer"}</strong><span>{t("Farmer")}{post.author?.region?` · ${post.author.region}`:""} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(post.created_at))}</span></div>{post.user_id===user.id&&<><button className="community-icon-action" aria-label={t("Edit your post")} onClick={()=>{setEditingPost(post.id);setEditTitle(post.title);setEditContent(post.content);}}><Pencil size={15}/></button><button className="community-icon-action" aria-label={t("Delete your post")} onClick={()=>removePost(post)} disabled={busyAction===post.id}><Trash2 size={16}/></button></>}</div>
        <span className="community-category">{categories.find(([key])=>key===post.category)?.[1]||post.category}</span>
        {editingPost===post.id?<form className="community-edit-form" onSubmit={event=>savePostEdit(event,post)}><input required maxLength={180} value={editTitle} onChange={event=>setEditTitle(event.target.value)}/><textarea required maxLength={10000} value={editContent} onChange={event=>setEditContent(event.target.value)}/><div><button className="primary" disabled={busyAction===post.id}>Save changes</button><button type="button" className="outline" onClick={()=>setEditingPost("")}>Cancel</button></div></form>:<><h2>{post.title}</h2><p className="community-post-text">{post.content}</p></>}
        {post.location&&<span className="community-location">{post.location}</span>}
        {post.signedImageUrls.length>0&&<div className="community-images">{post.signedImageUrls.map((url,index)=><img key={url} src={url} alt={`Post attachment ${index+1}`}/>)}</div>}
        <div className="community-post-actions"><button className={post.reacted?"reacted":""} onClick={()=>toggleReaction(post)} disabled={busyAction===post.id}><ThumbsUp size={15}/>{t("Helpful")} · {post.stats.helpful_count}</button><button onClick={()=>toggleComments(post.id)}><MessageCircle size={15}/>{t(openComments[post.id]?"Hide replies":"Reply")} · {post.stats.comment_count}</button>{post.user_id!==user.id&&<button onClick={()=>setReportTarget(reportTarget===post.id?"":post.id)}><MoreHorizontal size={16}/>{t("Report")}</button>}</div>
        {reportTarget===post.id&&<form className="community-report-form" onSubmit={submitReport}><select aria-label="Report reason" value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="misinformation">Harmful or misleading information</option><option value="other">Other</option></select><textarea maxLength={1000} value={reportDescription} onChange={e=>setReportDescription(e.target.value)} placeholder="Add details (optional)"/><button className="outline" disabled={busyAction===`report-${post.id}`}>Submit report</button><button type="button" className="community-icon-action" onClick={()=>setReportTarget("")}><X size={15}/></button></form>}
        {openComments[post.id]&&<div className="community-discussion">{(comments[post.id]||[]).map(comment=><div className={`community-comment ${comment.parent_comment_id?"nested":""}`} key={comment.id}><div className="post-avatar small">{initials(comment.author?.display_name)}</div><div className="community-comment-body"><strong>{comment.author?.display_name||"AgriPlus farmer"}</strong>{editingComment===comment.id?<form className="community-comment-edit" onSubmit={event=>saveCommentEdit(event,comment,post.id)}><textarea required maxLength={5000} value={editCommentText} onChange={event=>setEditCommentText(event.target.value)}/><button className="outline">{t("Save reply")}</button><button type="button" className="auth-link" onClick={()=>setEditingComment("")}>{t("Cancel")}</button></form>:<p>{comment.content}</p>}<small>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(comment.created_at))}</small><div className="community-comment-actions"><button onClick={()=>setReplyTarget(current=>({...current,[post.id]:comment.id}))}>{t("Reply")}</button>{comment.user_id===user.id?<><button onClick={()=>{setEditingComment(comment.id);setEditCommentText(comment.content);}}>{t("Edit")}</button><button onClick={()=>deleteComment(comment,post.id)}>{t("Delete")}</button></>:<button onClick={()=>setReportingComment(reportingComment===comment.id?"":comment.id)}>{t("Report")}</button>}</div>{reportingComment===comment.id&&<form className="community-comment-report" onSubmit={event=>submitCommentReport(event,comment,post.id)}><select value={reportReason} onChange={event=>setReportReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="misinformation">Harmful or misleading information</option><option value="other">Other</option></select><textarea maxLength={1000} value={reportDescription} onChange={event=>setReportDescription(event.target.value)} placeholder={t("Add details (optional)")}/><button className="outline">{t("Submit report")}</button></form>}</div></div>)}
          <form className="community-reply-form" onSubmit={e=>submitComment(e,post.id)}>{replyTarget[post.id]&&<span>Replying to a comment <button type="button" onClick={()=>setReplyTarget(current=>({...current,[post.id]:null}))}>Cancel</button></span>}<textarea required maxLength={5000} value={commentDrafts[post.id]||""} onChange={e=>setCommentDrafts(current=>({...current,[post.id]:e.target.value}))} placeholder="Write a reply…"/><button className="primary" disabled={busyAction===`comment-${post.id}`}><Send size={14}/> Reply</button></form>
        </div>}
      </article>)}
    </div>
    {hasMore&&<button className="outline community-load-more" disabled={loading} onClick={()=>fetchPosts(offset,true)}>{loading?"Loading…":"Load more posts"}</button>}
  </div></Localize>;
}
