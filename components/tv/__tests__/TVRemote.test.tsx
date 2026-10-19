import React from 'react';
import renderer,{act} from 'react-test-renderer';
import {TVButton,TVPoster} from '../TVKit';
const {tvFocusEventHandler} = require('react-native/Libraries/Components/TV/TVFocusEventHandler');
import {useRouter} from 'expo-router';
jest.mock('expo-router',()=>({useRouter:jest.fn()}));
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
