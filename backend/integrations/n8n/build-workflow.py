import json
from pathlib import Path
p = Path(__file__).parent
nodes=[]
def node(name,typ,version,pos,parameters,**extra):
    nodes.append(dict(id=name,name=name,type='n8n-nodes-base.'+typ,typeVersion=version,position=pos,parameters=parameters,**extra))
node('WhatsApp Trigger','whatsAppTrigger',1,[0,0],{'updates':['messages'],'options':{}})
node('Conversation','code',2,[240,0],{'jsCode':(p/'conversation.js').read_text(encoding='utf-8')})
node('Submit request?','if',2.2,[480,0],{'conditions':{'options':{'caseSensitive':True,'leftValue':'','typeValidation':'strict'},'conditions':[{'id':'submit','leftValue':'={{ $json.submit }}','rightValue':'','operator':{'type':'boolean','operation':'true','singleValue':True}}],'combinator':'and'},'options':{}})
node('Tootica login','httpRequest',4.2,[720,-120],{'method':'POST','url':"={{ $json.cfg.backendUrl + '/api/auth/login' }}",'authentication':'genericCredentialType','genericAuthType':'httpCustomAuth','sendBody':True,'specifyBody':'json','jsonBody':'{}','options':{'response':{'response':{'fullResponse':True}}}})
node('Extract session','code',2,[960,-120],{'mode':'runOnceForEachItem','jsCode':"const ctx = $('Conversation').item.json; const cookies = $json.headers['set-cookie']; const list = Array.isArray(cookies) ? cookies : [cookies || '']; const cookie = list.map(x=>x.split(';')[0]).find(x=>x.startsWith('access_token=')); if (!cookie) throw new Error('Login did not return access_token cookie'); return {json:{...ctx,cookie}};"})
node('Create pending WhatsApp request','httpRequest',4.2,[1200,-120],{'method':'POST','url':"={{ $json.cfg.backendUrl + '/api/appointments/whatsapp/inbound' }}",'sendHeaders':True,'headerParameters':{'parameters':[{'name':'Cookie','value':'={{ $json.cookie }}'}]},'sendBody':True,'specifyBody':'json','jsonBody':'={{ JSON.stringify($json.booking) }}','options':{}})
node('Request saved','code',2,[1440,-120],{'mode':'runOnceForEachItem','jsCode':"const ctx = $('Extract session').item.json; if (!$json.id) throw new Error('Missing appointment id'); const s = $getWorkflowStaticData('global').sessions[ctx.key]; s.step='done'; s.appointmentId=$json.id; const body = ctx.emergency ? 'Your urgent request has been added to our clinic team queue. Please call the clinic now: +' + ctx.cfg.staffPhone + '. Do not wait for a WhatsApp reply.' : 'Request received! Our clinic team will confirm your preferred time on WhatsApp. Reply RESCHEDULE or CANCEL anytime to contact the team.'; return {json:{...ctx,payload:{messaging_product:'whatsapp',to:ctx.to,type:'text',text:{body}}}};"})
node('Send WhatsApp reply','httpRequest',4.2,[1680,120],{'method':'POST','url':"={{ 'https://graph.facebook.com/' + $json.cfg.graphVersion + '/' + $json.cfg.phoneNumberId + '/messages' }}",'authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','sendBody':True,'specifyBody':'json','jsonBody':'={{ JSON.stringify($json.payload) }}','options':{}})
connections={}
def link(a,b,branch=0):
    main=connections.setdefault(a,{'main':[]})['main']
    while len(main)<=branch: main.append([])
    main[branch].append({'node':b,'type':'main','index':0})
link('WhatsApp Trigger','Conversation'); link('Conversation','Submit request?'); link('Submit request?','Tootica login'); link('Submit request?','Send WhatsApp reply',1)
link('Tootica login','Extract session'); link('Extract session','Create pending WhatsApp request'); link('Create pending WhatsApp request','Request saved'); link('Request saved','Send WhatsApp reply')
workflow={'name':'Tootica - WhatsApp booking requests (starter)','active':False,'nodes':nodes,'connections':connections,'settings':{'executionOrder':'v1','timezone':'Asia/Kolkata','saveDataSuccessExecution':'none','saveDataErrorExecution':'all'},'pinData':{},'tags':[]}
(p/'tootica-whatsapp-booking.json').write_text(json.dumps(workflow,indent=2)+'\n',encoding='utf-8')
