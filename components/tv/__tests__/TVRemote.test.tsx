import React from 'react';
import renderer,{act} from 'react-test-renderer';
import {TVButton,TVPoster} from '../TVKit';
const {tvFocusEventHandler} = require('react-native/Libraries/Components/TV/TVFocusEventHandler');
import {useRouter} from 'expo-router';
jest.mock('expo-router',()=>({
 useRouter:jest.fn(),
 useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[]),
}));
jest.mock('react-native/Libraries/Components/TV/useTVEventHandler',()=>jest.fn());
jest.mock('@/services/api',()=>({api:{getImageProxyUrl:(url:string)=>url}}));
jest.mock('react-native/Libraries/Components/TV/TVFocusEventHandler',()=>({tvFocusEventHandler:{register:jest.fn(),unregister:jest.fn()}}));
jest.mock('react-native/Libraries/Components/TV/tagForComponentOrHandle',()=>()=>42);
function remote(eventType:string){
 const calls=(tvFocusEventHandler!.register as jest.Mock).mock.calls;
 act(()=>calls[calls.length-1][1]({eventType,tag:42}));
}
beforeEach(()=>jest.clearAllMocks());
test('TV confirmation invokes a focused button exactly once',()=>{
 const onPress=jest.fn();let tree:renderer.ReactTestRenderer;
 act(()=>{tree=renderer.create(<TVButton label="电影" onPress={onPress}/>);});
 remote('focus');remote('select');expect(onPress).toHaveBeenCalledTimes(1);
 remote('blur');remote('select');expect(onPress).toHaveBeenCalledTimes(1);
 act(()=>tree!.unmount());
});
test('TV confirmation opens the focused film detail',()=>{
 const push=jest.fn();(useRouter as jest.Mock).mockReturnValue({push});let tree:renderer.ReactTestRenderer;
 act(()=>{tree=renderer.create(<TVPoster film={{title:'测试影片',poster:''}}/>);});
 remote('focus');remote('select');expect(push).toHaveBeenCalledWith({pathname:'/detail',params:{q:'测试影片'}});
 act(()=>tree!.unmount());
});

test('category Up points to the header and header Down returns to the focused category',()=>{
 const RN=require('react-native');const {TVShell}=require('../TVKit');
 const nativeHandle=jest.spyOn(RN,'findNodeHandle').mockReturnValue(100);
 let tree:renderer.ReactTestRenderer;
 act(()=>{tree=renderer.create(<TVShell><TVButton toHeader label="电影" onPress={()=>{}}/></TVShell>);});
 const button=(label:string)=>tree!.root.findAllByType(RN.Pressable).find(node=>node.props.accessibilityLabel===label)!;
 act(()=>button('首页').props.onLayout());
 expect(button('电影').props.nextFocusUp).toBe(100);
 nativeHandle.mockReturnValue(200);
 act(()=>button('电影').props.onFocus());
 for(const label of ['首页','搜索','收藏','设置']) expect(button(label).props.nextFocusDown).toBe(200);
 act(()=>tree!.unmount());nativeHandle.mockRestore();
});

jest.mock('@/hooks/useResponsiveLayout',()=>({useResponsiveLayout:()=>({deviceType:'tv'})}));
jest.mock('@/hooks/useAnimation',()=>({useButtonAnimation:()=>({})}));
test('player media button responds to remote focus and confirmation',()=>{
 const {MediaButton}=require('../../MediaButton');const {Text}=require('react-native');
 const onPress=jest.fn();let tree:renderer.ReactTestRenderer;
 act(()=>{tree=renderer.create(<MediaButton accessibilityLabel="从头播放" onPress={onPress}><Text>从头播放</Text></MediaButton>);});
 remote('focus');remote('select');expect(onPress).toHaveBeenCalledTimes(1);
 act(()=>tree!.unmount());
});

function homeHarness(active = '首页') {
 const RN=require('react-native');const {TVShell}=require('../TVKit');
 const nodes:Record<string,{requestTVFocus:jest.Mock}>={};
 let tree:renderer.ReactTestRenderer;
 act(()=>{tree=renderer.create(<TVShell active={active}>
   <TVButton toHeader selected label="电影" onPress={()=>{}}/>
   <TVPoster film={{title:'海报',poster:''}}/>
   <TVButton label="重试" onPress={()=>{}}/>
 </TVShell>);});
 // Jest's View mock exposes a class instance rather than native imperative methods.
 for (const view of tree!.root.findAllByType(RN.View)) {
   const label=view.props.accessibilityLabel;
   if(label && view.instance) {
     view.instance.requestTVFocus=jest.fn();
     nodes[label]=view.instance;
   }
 }
 const button=(label:string)=>tree!.root.findAllByType(RN.Pressable).find(node=>node.props.accessibilityLabel===label)!;
 act(()=>{button('首页').props.onLayout();button('电影').props.onLayout();});
 const handler=(RN.useTVEventHandler as jest.Mock).mock.calls.slice(-1)[0][0];
 return {nodes,focus:(label:string)=>act(()=>button(label).props.onFocus()),
   up:(eventType='up',eventKeyAction=1)=>act(()=>handler({eventType,eventKeyAction})),
   close:()=>act(()=>tree.unmount())};
}
test.each(['海报','重试'])('Up from %s reaches category then header without horizontal alignment',label=>{
 const h=homeHarness();h.focus(label);h.up();
 expect(h.nodes['电影'].requestTVFocus).toHaveBeenCalledTimes(1);
 h.focus('电影');h.up();expect(h.nodes['首页'].requestTVFocus).toHaveBeenCalledTimes(1);
 h.focus('搜索');h.up();expect(h.nodes['首页'].requestTVFocus).toHaveBeenCalledTimes(1);
 h.close();
});
test('key-down does not double-advance; long Up enters header; inactive routes ignore events',()=>{
 const h=homeHarness();h.focus('海报');h.up('up',0);
 expect(h.nodes['电影'].requestTVFocus).not.toHaveBeenCalled();
 h.up('longUp',0);expect(h.nodes['首页'].requestTVFocus).toHaveBeenCalledTimes(1);
 h.close();h.up();expect(h.nodes['电影'].requestTVFocus).not.toHaveBeenCalled();
 const other=homeHarness('收藏');other.focus('海报');other.up();
 expect(other.nodes['电影'].requestTVFocus).not.toHaveBeenCalled();other.close();
});
