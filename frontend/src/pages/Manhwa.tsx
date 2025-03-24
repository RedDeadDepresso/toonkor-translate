import { useParams } from "react-router-dom"
import { useElementSize, useFetch, useViewportSize } from "@mantine/hooks"
import { ManhwaHeader } from "@/components/ManhwaHeader/ManhwaHeader";
import { useContext, useEffect, useState } from "react";
import ManhwaData from "@/types/manhwaData";
import { Center, Loader, SimpleGrid, Text } from "@mantine/core";
import { NavBar } from "@/components/NavBar/NavBar";
import ChaptersTable from "@/components/ChaptersTable/ChaptersTable";
import { SettingsContext } from "@/contexts/SettingsContext";


const Manhwa = () => {
    const {toonkorId} = useParams<string>();
    const [manhwaData, setManhwaData] = useState<ManhwaData>();
    const{displayEnglish} = useContext(SettingsContext);
    const { data, loading, error, refetch, abort } = useFetch<ManhwaData>(
        `/api/manhwa?toonkor_id=/${toonkorId}`
    );

    useEffect(() => {
        if (data) {
            setManhwaData(data);
        }
      }, [data]);

      useEffect(() => {
        if (data) {
            document.title = displayEnglish && data.en_title ? data.en_title : data.title;
        }
      }, [data, displayEnglish]);
      
    return (
        <>
        <NavBar showSearchBar={false}/>
        {loading && <Center><Loader color="blue" /></Center>}
        {error && <Text c="red">{error.message}</Text>}
        <SimpleGrid cols={{ base: 1, md: 2 }}>
            {manhwaData && <ManhwaHeader manhwaData={manhwaData}/>}
            {manhwaData && <ChaptersTable toonkorId={toonkorId} chapterDataList={manhwaData.chapters}/>} 
        </SimpleGrid>
        </>
    )
}

export default Manhwa