import usePlayerStore from '../playerStore';
import Toast from 'react-native-toast-message';
jest.mock('react-native-toast-message',()=>({show:jest.fn()}));
jest.mock('@/services/storage',()=>({PlayRecordManager:{save:jest.fn()},PlayerSettingsManager:{}}));
jest.mock('../detailStore',()=>({__esModule:true,default:{getState:()=>({detail:null})},episodesSelectorBySource:jest.fn()}));
jest.mock('@/utils/Logger',()=>({withTag:()=>({debug:jest.fn(),info:jest.fn(),error:jest.fn(),warn:jest.fn()})}));
test('restart replays the current episode at zero and preserves intro settings',async()=>{
 const replayAsync=jest.fn().mockResolvedValue({isLoaded:true,positionMillis:0,isPlaying:true});
 const save=jest.fn();
 usePlayerStore.setState({videoRef:{current:{replayAsync} as any},status:{isLoaded:true,positionMillis:120000} as any,currentEpisodeIndex:4,introEndTime:60000,progressPosition:.5,isSeeking:true,showNextEpisodeOverlay:true,_savePlayRecord:save});
 await usePlayerStore.getState().restartPlayback();
 expect(replayAsync).toHaveBeenCalledWith({positionMillis:0,shouldPlay:true});
 expect(usePlayerStore.getState()).toMatchObject({currentEpisodeIndex:4,introEndTime:60000,progressPosition:0,isSeeking:false,showNextEpisodeOverlay:false});
 expect(save).toHaveBeenCalledWith({play_time:0},{immediate:true});
});
test('failed restart leaves the current position intact and reports the error',async()=>{
 usePlayerStore.setState({videoRef:{current:{replayAsync:jest.fn().mockRejectedValue(new Error('offline'))} as any},status:{isLoaded:true,positionMillis:120000} as any,progressPosition:.5});
 await usePlayerStore.getState().restartPlayback();
 expect(usePlayerStore.getState().progressPosition).toBe(.5);
 expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({type:'error'}));
});
