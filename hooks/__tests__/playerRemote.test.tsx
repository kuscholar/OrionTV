import React from 'react';
import renderer,{act} from 'react-test-renderer';
import {useTVEventHandler} from 'react-native';
import usePlayerStore from '@/stores/playerStore';
import {useTVRemoteHandler} from '../useTVRemoteHandler';
jest.mock('react-native',()=>({useTVEventHandler:jest.fn()}));
jest.mock('@/stores/playerStore',()=>({__esModule:true,default:jest.fn()}));
const setShowControls=jest.fn(),seek=jest.fn(),togglePlayPause=jest.fn();
function Harness(){useTVRemoteHandler();return null;}
function event(eventType:string){const calls=(useTVEventHandler as jest.Mock).mock.calls;act(()=>calls[calls.length-1][0]({eventType}));}
beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();});
afterEach(()=>jest.useRealTimers());
function mount(extra={}){(usePlayerStore as unknown as jest.Mock).mockReturnValue({showControls:false,showEpisodeModal:false,showSourceModal:false,showSpeedModal:false,setShowControls,seek,togglePlayPause,...extra});let tree:renderer.ReactTestRenderer;act(()=>{tree=renderer.create(<Harness/>);});return ()=>act(()=>tree.unmount());}
test('confirmation reveals controls without also toggling playback',()=>{const close=mount();event('select');expect(setShowControls).toHaveBeenCalledWith(true);expect(togglePlayPause).not.toHaveBeenCalled();close();});
test('visible controls use left/right for focus instead of seeking',()=>{const close=mount({showControls:true});event('right');event('left');expect(seek).not.toHaveBeenCalled();close();});
test.each(['showEpisodeModal','showSourceModal','showSpeedModal'])('%s blocks background actions and auto-hide',flag=>{const close=mount({showControls:true,[flag]:true});event('right');event('select');act(()=>jest.advanceTimersByTime(6000));expect(seek).not.toHaveBeenCalled();expect(setShowControls).not.toHaveBeenCalled();close();});
